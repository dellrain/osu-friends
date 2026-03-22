import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force";
import type { GraphLink, GraphNode, OsuUser } from "../types";
import type { GraphViewMode } from "./viewModes";

type LinkDatum = GraphLink;

export type CircleGraphHandlers = {
  onNodeClick?: (userId: number, username: string) => void;
  onBackgroundClick?: () => void;
};

type PointerDownState =
  | { kind: "node"; node: GraphNode; cx: number; cy: number }
  | { kind: "empty"; cx: number; cy: number };

function loadAvatar(url: string): Promise<HTMLImageElement | null> {
  if (!url?.trim()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url.trim();
  });
}

export class CircleGraph {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private handlers: CircleGraphHandlers | undefined;
  private nodes: GraphNode[] = [];
  private links: LinkDatum[] = [];
  private images = new Map<number, HTMLImageElement | null>();
  private tx = 0;
  private ty = 0;
  private scale = 1;
  private dragging: GraphNode | null = null;
  private panStart: { sx: number; sy: number; tx: number; ty: number } | null = null;
  private pointerDown: PointerDownState | null = null;
  private sim = forceSimulation<GraphNode>([]);
  private ro: ResizeObserver;
  private dpr = 1;
  private pinCenterId: number | null = null;
  private selectedUserId: number | null = null;
  private viewMode: GraphViewMode = "force";

  constructor(canvas: HTMLCanvasElement, handlers?: CircleGraphHandlers) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context");
    this.canvas = canvas;
    this.ctx = ctx;
    this.handlers = handlers;

    try {
      const s = sessionStorage.getItem("graphViewMode");
      if (s === "force" || s === "tree" || s === "radial" || s === "grid") {
        this.viewMode = s;
      }
    } catch {
      /* ignore */
    }

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();

    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
  }

  destroy(): void {
    this.ro.disconnect();
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.sim.stop();
  }

  setSelectedUserId(id: number | null): void {
    this.selectedUserId = id;
    this.draw();
  }

  getViewMode(): GraphViewMode {
    return this.viewMode;
  }

  setViewMode(mode: GraphViewMode): void {
    this.viewMode = mode;
    try {
      sessionStorage.setItem("graphViewMode", mode);
    } catch {
      /* ignore */
    }
    if (this.nodes.length === 0) {
      this.draw();
      return;
    }
    this.applyCurrentLayout();
    this.fitView();
    this.draw();
  }

  /** Тот же движок, что у «Весь мир»; при `pinUserId` этот узел зафиксирован в центре (вкладка «Мои друзья»). */
  async setWorldData(
    users: OsuUser[],
    edges: [number, number][],
    opts?: { pinUserId?: number | null },
  ): Promise<void> {
    this.selectedUserId = null;
    this.sim.stop();
    this.images.clear();

    if (users.length === 0) {
      this.pinCenterId = null;
      this.nodes = [];
      this.links = [];
      this.fitView();
      this.draw();
      return;
    }

    const pinId = opts?.pinUserId ?? null;
    const pinUser = pinId != null ? users.find((u) => u.id === pinId) : undefined;
    this.pinCenterId = pinUser != null ? pinUser.id : null;

    const idToNode = new Map<number, GraphNode>();
    for (const u of users) {
      const isPin = pinUser != null && u.id === pinUser.id;
      idToNode.set(u.id, {
        ...u,
        x: 0,
        y: 0,
        r: isPin ? 30 : 22,
        fx: null,
        fy: null,
      });
    }

    this.nodes = [...idToNode.values()];
    this.links = edges
      .map(([from, to]) => {
        const s = idToNode.get(from);
        const t = idToNode.get(to);
        if (!s || !t) return null;
        return { source: s, target: t };
      })
      .filter((L): L is LinkDatum => L !== null);

    const loads = this.nodes.map(async (node) => {
      const img = await loadAvatar(node.avatar_url);
      this.images.set(node.id, img);
    });
    await Promise.all(loads);

    this.applyCurrentLayout();
    this.fitView();
    this.draw();
  }

  private applyCurrentLayout(): void {
    this.sim.stop();

    switch (this.viewMode) {
      case "force":
        this.applyInitialCircle();
        this.startForceSimulation();
        break;
      case "tree":
        this.layoutTree();
        this.freezeAllNodes();
        break;
      case "radial":
        this.layoutRadial();
        this.freezeAllNodes();
        break;
      case "grid":
        this.layoutGrid();
        this.freezeAllNodes();
        break;
      default:
        this.applyInitialCircle();
        this.startForceSimulation();
    }
  }

  private applyInitialCircle(): void {
    const pinUser =
      this.pinCenterId != null ? this.nodes.find((n) => n.id === this.pinCenterId) : undefined;
    const usePin = pinUser != null;
    const n = this.nodes.length;

    if (usePin && pinUser) {
      pinUser.x = 0;
      pinUser.y = 0;
      pinUser.r = 30;
      const orbit = this.nodes.filter((u) => u.id !== pinUser.id);
      const nO = orbit.length;
      orbit.forEach((u, i) => {
        const a = nO > 0 ? (i / nO) * Math.PI * 2 : 0;
        const spread = 50 + Math.sqrt(Math.max(nO, 1)) * 42;
        u.x = Math.cos(a) * spread;
        u.y = Math.sin(a) * spread;
        u.r = 22;
      });
    } else {
      this.nodes.forEach((u, i) => {
        const a = n > 1 ? (i / n) * Math.PI * 2 : 0;
        const spread = 50 + Math.sqrt(n) * 42;
        u.x = Math.cos(a) * spread;
        u.y = Math.sin(a) * spread;
        u.r = 22;
      });
    }
  }

  private startForceSimulation(): void {
    const n = this.nodes.length;
    for (const node of this.nodes) {
      if (this.pinCenterId === node.id) {
        node.fx = 0;
        node.fy = 0;
        node.x = 0;
        node.y = 0;
      } else {
        node.fx = null;
        node.fy = null;
      }
    }

    const charge = -320 - Math.min(n * 8, 400);
    const linkDist = 70 + Math.min(n * 2, 80);

    this.sim = forceSimulation<GraphNode>(this.nodes)
      .force(
        "link",
        forceLink<GraphNode, LinkDatum>(this.links)
          .id((d) => String(d.id))
          .distance(linkDist)
          .strength(0.45),
      )
      .force("charge", forceManyBody<GraphNode>().strength(charge))
      .force("center", forceCenter(0, 0))
      .force(
        "collide",
        forceCollide<GraphNode>()
          .radius((d) => d.r + 5)
          .strength(0.85),
      )
      .alphaDecay(0.022)
      .on("tick", () => this.draw());

    this.sim.alpha(1).restart();
  }

  private freezeAllNodes(): void {
    for (const n of this.nodes) {
      n.fx = n.x;
      n.fy = n.y;
    }
    this.sim = forceSimulation<GraphNode>([]);
  }

  private buildAdj(): Map<number, Set<number>> {
    const m = new Map<number, Set<number>>();
    for (const n of this.nodes) m.set(n.id, new Set());
    for (const L of this.links) {
      const a = L.source.id;
      const b = L.target.id;
      m.get(a)!.add(b);
      m.get(b)!.add(a);
    }
    return m;
  }

  private pickRoot(): number {
    if (this.pinCenterId != null && this.nodes.some((n) => n.id === this.pinCenterId)) {
      return this.pinCenterId;
    }
    const adj = this.buildAdj();
    let best = this.nodes[0]!.id;
    let bestDeg = -1;
    for (const n of this.nodes) {
      const deg = adj.get(n.id)?.size ?? 0;
      if (deg > bestDeg) {
        bestDeg = deg;
        best = n.id;
      }
    }
    return best;
  }

  private bfsDepths(root: number, adj: Map<number, Set<number>>): Map<number, number> {
    const depth = new Map<number, number>();
    const q: number[] = [];
    if (this.nodes.some((n) => n.id === root)) {
      depth.set(root, 0);
      q.push(root);
    }
    for (let qi = 0; qi < q.length; qi++) {
      const u = q[qi]!;
      const du = depth.get(u)!;
      for (const v of adj.get(u) ?? []) {
        if (!depth.has(v)) {
          depth.set(v, du + 1);
          q.push(v);
        }
      }
    }
    let maxD = 0;
    for (const d of depth.values()) maxD = Math.max(maxD, d);
    const orphan = maxD + 1;
    for (const n of this.nodes) {
      if (!depth.has(n.id)) depth.set(n.id, orphan);
    }
    return depth;
  }

  private layoutTree(): void {
    const adj = this.buildAdj();
    const root = this.pickRoot();
    const depthMap = this.bfsDepths(root, adj);
    const byDepth = new Map<number, GraphNode[]>();
    let maxD = 0;
    for (const n of this.nodes) {
      const d = depthMap.get(n.id) ?? 0;
      maxD = Math.max(maxD, d);
      const arr = byDepth.get(d) ?? [];
      arr.push(n);
      byDepth.set(d, arr);
    }
    for (const arr of byDepth.values()) {
      arr.sort((a, b) => a.username.localeCompare(b.username));
    }
    const rowGap = 100;
    const colGap = 92;
    for (let d = 0; d <= maxD; d++) {
      const row = byDepth.get(d);
      if (!row?.length) continue;
      const k = row.length;
      for (let j = 0; j < k; j++) {
        const node = row[j]!;
        node.x = (j - (k - 1) / 2) * colGap;
        node.y = d * rowGap;
      }
    }
  }

  private layoutRadial(): void {
    const adj = this.buildAdj();
    const root = this.pickRoot();
    const depthMap = this.bfsDepths(root, adj);
    const byDepth = new Map<number, GraphNode[]>();
    let maxD = 0;
    for (const n of this.nodes) {
      const d = depthMap.get(n.id) ?? 0;
      maxD = Math.max(maxD, d);
      const arr = byDepth.get(d) ?? [];
      arr.push(n);
      byDepth.set(d, arr);
    }
    for (const arr of byDepth.values()) {
      arr.sort((a, b) => a.id - b.id);
    }
    const rootNode = this.nodes.find((n) => n.id === root);
    if (rootNode) {
      rootNode.x = 0;
      rootNode.y = 0;
    }
    const ringGap = 98;
    for (let d = 1; d <= maxD; d++) {
      const row = byDepth.get(d);
      if (!row?.length) continue;
      const R = ringGap * d;
      const k = row.length;
      for (let j = 0; j < k; j++) {
        const node = row[j]!;
        const ang = (j / k) * Math.PI * 2 - Math.PI / 2;
        node.x = Math.cos(ang) * R;
        node.y = Math.sin(ang) * R;
      }
    }
  }

  private layoutGrid(): void {
    const sorted = [...this.nodes].sort((a, b) => a.id - b.id);
    const n = sorted.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const gap = 88;
    const rows = Math.ceil(n / cols);
    for (let i = 0; i < n; i++) {
      const node = sorted[i]!;
      const col = i % cols;
      const row = Math.floor(i / cols);
      node.x = (col - (cols - 1) / 2) * gap;
      node.y = (row - (rows - 1) / 2) * gap;
    }
  }

  private resize = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));
    this.draw();
  };

  private screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = (clientX - rect.left) * this.dpr;
    const sy = (clientY - rect.top) * this.dpr;
    return {
      x: (sx - this.tx) / this.scale,
      y: (sy - this.ty) / this.scale,
    };
  }

  private labelContains(n: GraphNode, wx: number, wy: number): boolean {
    const screenR = n.r * this.scale;
    if (screenR < 3) return false;
    const lodMinScreen = 7;
    const lodMaxScreen = 22;
    const fontScreen = Math.max(0, Math.min(lodMaxScreen, screenR * 0.55));
    if (fontScreen < lodMinScreen) return false;
    const fontWorld = fontScreen / this.scale;
    const labelY = n.y + n.r + 4 / this.scale;
    const padX = fontWorld * 0.45;
    const wEst = Math.max(n.username.length * fontWorld * 0.52, fontWorld * 3);
    const hEst = fontWorld * 1.2;
    return (
      wx >= n.x - wEst / 2 - padX &&
      wx <= n.x + wEst / 2 + padX &&
      wy >= labelY - fontWorld * 0.2 &&
      wy <= labelY + hEst
    );
  }

  private pickNode(wx: number, wy: number): GraphNode | null {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i]!;
      const dx = wx - n.x;
      const dy = wy - n.y;
      if (dx * dx + dy * dy <= n.r * n.r) return n;
      if (this.labelContains(n, wx, wy)) return n;
    }
    return null;
  }

  private beginNodeDrag(node: GraphNode): void {
    this.dragging = node;
    node.fx = node.x;
    node.fy = node.y;
    if (this.viewMode === "force") {
      this.sim.alphaTarget(0.35).restart();
    }
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * this.dpr;
    const sy = (e.clientY - rect.top) * this.dpr;
    const wx = (sx - this.tx) / this.scale;
    const wy = (sy - this.ty) / this.scale;
    const factor = e.deltaY > 0 ? 0.92 : 1.09;
    const newScale = Math.min(6, Math.max(0.08, this.scale * factor));
    this.tx = sx - wx * newScale;
    this.ty = sy - wy * newScale;
    this.scale = newScale;
    this.draw();
  };

  private onPointerDown = (e: PointerEvent): void => {
    const { x, y } = this.screenToWorld(e.clientX, e.clientY);
    const node = this.pickNode(x, y);
    if (node) {
      this.pointerDown = { kind: "node", node, cx: e.clientX, cy: e.clientY };
      this.canvas.setPointerCapture(e.pointerId);
    } else {
      this.pointerDown = { kind: "empty", cx: e.clientX, cy: e.clientY };
      this.panStart = {
        sx: e.clientX,
        sy: e.clientY,
        tx: this.tx,
        ty: this.ty,
      };
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.pointerDown?.kind === "node" && !this.dragging) {
      const d = Math.hypot(e.clientX - this.pointerDown.cx, e.clientY - this.pointerDown.cy);
      if (d > 6) {
        this.beginNodeDrag(this.pointerDown.node);
        this.pointerDown = null;
      }
    }
    if (this.dragging) {
      const { x, y } = this.screenToWorld(e.clientX, e.clientY);
      this.dragging.fx = x;
      this.dragging.fy = y;
      if (this.viewMode !== "force") {
        this.dragging.x = x;
        this.dragging.y = y;
        this.draw();
      }
      return;
    }
    if (this.panStart) {
      const dx = (e.clientX - this.panStart.sx) * this.dpr;
      const dy = (e.clientY - this.panStart.sy) * this.dpr;
      this.tx = this.panStart.tx + dx;
      this.ty = this.panStart.ty + dy;
      this.draw();
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.pointerDown?.kind === "node" && !this.dragging) {
      const d = Math.hypot(e.clientX - this.pointerDown.cx, e.clientY - this.pointerDown.cy);
      if (d <= 8) {
        const n = this.pointerDown.node;
        this.handlers?.onNodeClick?.(n.id, n.username);
      }
    } else if (this.pointerDown?.kind === "empty" && !this.dragging) {
      const d = Math.hypot(e.clientX - this.pointerDown.cx, e.clientY - this.pointerDown.cy);
      if (d <= 10) this.handlers?.onBackgroundClick?.();
    }
    this.pointerDown = null;

    if (this.dragging) {
      if (this.pinCenterId !== null && this.dragging.id === this.pinCenterId) {
        this.dragging.fx = 0;
        this.dragging.fy = 0;
        this.dragging.x = 0;
        this.dragging.y = 0;
      } else if (this.viewMode === "force") {
        this.dragging.fx = null;
        this.dragging.fy = null;
      } else {
        const d = this.dragging;
        d.x = d.fx ?? d.x;
        d.y = d.fy ?? d.y;
        d.fx = d.x;
        d.fy = d.y;
      }
      this.dragging = null;
      if (this.viewMode === "force") {
        this.sim.alphaTarget(0);
      }
    }
    this.panStart = null;
  };

  private onPointerLeave = (): void => {
    this.pointerDown = null;
    this.panStart = null;
    if (this.dragging) {
      if (this.pinCenterId !== null && this.dragging.id === this.pinCenterId) {
        this.dragging.fx = 0;
        this.dragging.fy = 0;
        this.dragging.x = 0;
        this.dragging.y = 0;
      } else if (this.viewMode === "force") {
        this.dragging.fx = null;
        this.dragging.fy = null;
      } else {
        const d = this.dragging;
        d.x = d.fx ?? d.x;
        d.y = d.fy ?? d.y;
        d.fx = d.x;
        d.fy = d.y;
      }
      this.dragging = null;
      if (this.viewMode === "force") {
        this.sim.alphaTarget(0);
      }
    }
  };

  private fitView(): void {
    if (this.nodes.length === 0) {
      this.scale = 1;
      this.tx = this.canvas.width / 2;
      this.ty = this.canvas.height / 2;
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of this.nodes) {
      minX = Math.min(minX, n.x - n.r);
      minY = Math.min(minY, n.y - n.r);
      maxX = Math.max(maxX, n.x + n.r);
      maxY = Math.max(maxY, n.y + n.r);
    }
    const pad = 80 * this.dpr;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const bw = maxX - minX || 1;
    const bh = maxY - minY || 1;
    const s = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh, 1.2);
    this.scale = Math.max(0.12, s);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.tx = w / 2 - cx * this.scale;
    this.ty = h / 2 - cy * this.scale;
  }

  private draw(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0d0d10";
    ctx.fillRect(0, 0, w, h);

    ctx.setTransform(this.scale, 0, 0, this.scale, this.tx, this.ty);

    ctx.strokeStyle = "rgba(200,210,255,0.22)";
    ctx.lineWidth = 1 / this.scale;
    for (const L of this.links) {
      const s = L.source;
      const t = L.target;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }

    for (const n of this.nodes) {
      const img = this.images.get(n.id);
      ctx.save();
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.clip();
      if (img) {
        ctx.drawImage(img, n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
      } else {
        ctx.fillStyle = "#2a2a36";
        ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1.5 / this.scale;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.stroke();
      if (this.selectedUserId === n.id) {
        ctx.strokeStyle = "rgba(255, 102, 171, 0.95)";
        ctx.lineWidth = 3.5 / this.scale;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 4 / this.scale, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    const lodMinScreen = 7;
    const lodMaxScreen = 22;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const n of this.nodes) {
      const screenR = n.r * this.scale;
      if (screenR < 3) continue;
      const fontScreen = Math.max(0, Math.min(lodMaxScreen, screenR * 0.55));
      if (fontScreen < lodMinScreen) continue;
      const fontWorld = fontScreen / this.scale;
      ctx.font = `600 ${fontWorld}px system-ui, sans-serif`;
      const labelY = n.y + n.r + 4 / this.scale;
      ctx.lineWidth = 3 / this.scale;
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.strokeText(n.username, n.x, labelY);
      ctx.fillStyle = "rgba(245,245,250,0.95)";
      ctx.fillText(n.username, n.x, labelY);
    }

    ctx.restore();
  }
}
