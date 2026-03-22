/** Режимы отображения графа (нижняя панель переключения). */
export type GraphViewMode = "force" | "tree" | "radial" | "grid";

export const GRAPH_VIEW_MODES: GraphViewMode[] = ["force", "tree", "radial", "grid"];

export const VIEW_MODE_LABELS: Record<GraphViewMode, string> = {
  force: "Связи (физика)",
  tree: "Дерево от корня",
  radial: "Кольца вокруг корня",
  grid: "Сетка",
};
