import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  Handle,
  Position,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  ExternalLink,
  Focus,
  KeyRound,
  Layers3,
  Network,
  Search,
  ServerCog,
  X,
} from "lucide-react";
import { type CSSProperties, useCallback, useId, useMemo, useState, type ReactNode } from "react";
import { translate, useI18n } from "../lib/i18n";
import { KIND_LABELS } from "../lib/assetTemplates";
import { formatEnvironment } from "../lib/format";
import type { AssetKind } from "../types";
import type { GraphData, GraphEdge, GraphNode } from "../types";

const palette: Record<GraphNode["nodeType"], string> = {
  asset: "#d66c47",
  project: "#39728a",
  service: "#b58a4a",
  environment: "#78947d",
};

const nodeTypeLabels: Record<GraphNode["nodeType"], string> = {
  asset: "凭证",
  project: "产品",
  service: "产品组成",
  environment: "环境",
};

const nodeTypeOrder: Record<GraphNode["nodeType"], number> = {
  asset: 0,
  project: 1,
  service: 2,
  environment: 3,
};

const assetKindCodes = new Set<AssetKind>(Object.keys(KIND_LABELS) as AssetKind[]);

const ORB_BASE_RADIUS: Record<GraphNode["nodeType"], number> = {
  asset: 20,
  project: 23,
  service: 18,
  environment: 17,
};

// 力导向模拟常量：全部固定，保证同一份数据每次渲染的布局完全一致。
const LINK_GAP = 78;
const REPULSION = 34000;
const COLLISION_GAP = 12;
const COMPONENT_GAP = 130;
const PACK_ROW_WIDTH = 2400;
const GOLDEN_ANGLE = 2.399963229728653;

interface GraphViewProps {
  data: GraphData;
  focusId?: string;
  onFocus: (id?: string) => void;
  onOpenNode: (node: GraphNode) => void;
}

export interface GraphConnection {
  edge: GraphEdge;
  node: GraphNode;
  direction: "incoming" | "outgoing";
}

export interface GraphLayout {
  /** 节点圆心坐标（非 ReactFlow 的左上角）。 */
  positions: Map<string, { x: number; y: number }>;
  radii: Map<string, number>;
}

export function graphNodeRadius(node: GraphNode, degree: number): number {
  return ORB_BASE_RADIUS[node.nodeType] + Math.min(15, Math.sqrt(degree) * 5);
}

interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

/**
 * 对一个连通分量运行确定性的力导向模拟：黄金角螺旋初始化，
 * 斥力 + 弹簧 + 向心力迭代，最后用碰撞松弛保证节点互不重叠。
 */
function simulateComponent(
  component: GraphNode[],
  radii: Map<string, number>,
  componentEdges: GraphEdge[],
  seedPhase: number,
): Map<string, { x: number; y: number }> {
  const ordered = [...component].sort(
    (left, right) =>
      nodeTypeOrder[left.nodeType] - nodeTypeOrder[right.nodeType] ||
      left.label.localeCompare(right.label, "zh-CN"),
  );
  const nodes: SimNode[] = ordered.map((entity, index) => {
    const angle = index * GOLDEN_ANGLE + seedPhase;
    const distance = 30 * Math.sqrt(index + 0.6);
    return {
      id: entity.id,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      vx: 0,
      vy: 0,
      radius: radii.get(entity.id) || 20,
    };
  });
  const indexOf = new Map(nodes.map((node, index) => [node.id, index]));
  const links = componentEdges
    .map((edge) => ({ a: indexOf.get(edge.source), b: indexOf.get(edge.target) }))
    .filter((link) => link.a !== undefined && link.b !== undefined);

  const iterations = nodes.length > 120 ? 240 : 420;
  let alpha = 1;
  for (let step = 0; step < iterations; step++) {
    alpha = Math.max(0.04, alpha * 0.992);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distanceSq = dx * dx + dy * dy;
        if (distanceSq < 0.01) {
          dx = 0.4;
          dy = (i % 2 === 0 ? 1 : -1) * 0.4;
          distanceSq = dx * dx + dy * dy;
        }
        const distance = Math.sqrt(distanceSq);
        const force = ((REPULSION / distanceSq) * alpha) / 2;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }
    for (const link of links) {
      const a = nodes[link.a as number];
      const b = nodes[link.b as number];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const rest = Math.max(112, a.radius + b.radius + LINK_GAP);
      const stretch = distance - rest;
      // 压缩时刚性更强，避免链路蜷成一团；拉伸时温和回拉。
      const force = (stretch > 0 ? stretch * 0.08 : stretch * 0.4) * alpha;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
    let centerX = 0;
    let centerY = 0;
    for (const node of nodes) {
      centerX += node.x;
      centerY += node.y;
    }
    centerX /= nodes.length;
    centerY /= nodes.length;
    for (const node of nodes) {
      node.vx += (centerX - node.x) * 0.004 * alpha;
      node.vy += (centerY - node.y) * 0.004 * alpha;
      node.vx *= 0.6;
      node.vy *= 0.6;
      const speed = Math.hypot(node.vx, node.vy);
      const cap = 14 * alpha + 1;
      if (speed > cap) {
        node.vx = (node.vx / speed) * cap;
        node.vy = (node.vy / speed) * cap;
      }
      node.x += node.vx;
      node.y += node.vy;
    }
  }

  // 碰撞松弛：把重叠的圆沿连线推开，最多 80 轮。
  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        const minimum = a.radius + b.radius + COLLISION_GAP;
        if (distance >= minimum) continue;
        if (distance < 0.01) {
          dx = 0.4;
          dy = (i % 2 === 0 ? 1 : -1) * 0.4;
          distance = Math.hypot(dx, dy);
        }
        const push = (minimum - distance) / 2;
        const nx = (dx / distance) * push;
        const ny = (dy / distance) * push;
        a.x -= nx;
        a.y -= ny;
        b.x += nx;
        b.y += ny;
        moved = true;
      }
    }
    if (!moved) break;
  }

  return new Map(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
}

export function buildGraphLayout(items: GraphNode[], edges: GraphEdge[] = []): GraphLayout {
  const nodesById = new Map(items.map((item) => [item.id, item]));
  const validEdges = edges.filter(
    (edge) => nodesById.has(edge.source) && nodesById.has(edge.target),
  );
  const neighbors = new Map(items.map((item) => [item.id, new Set<string>()]));
  const degrees = new Map<string, number>();
  for (const edge of validEdges) {
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
    degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
  }
  const radii = new Map(
    items.map((item) => [item.id, graphNodeRadius(item, degrees.get(item.id) || 0)]),
  );

  const components: GraphNode[][] = [];
  const visited = new Set<string>();
  for (const item of items) {
    if (visited.has(item.id)) continue;
    const component: GraphNode[] = [];
    const pending = [item.id];
    visited.add(item.id);
    while (pending.length) {
      const id = pending.shift();
      const node = id ? nodesById.get(id) : undefined;
      if (node) component.push(node);
      for (const neighbor of id ? neighbors.get(id) || [] : []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          pending.push(neighbor);
        }
      }
    }
    components.push(component);
  }
  const componentKey = (component: GraphNode[]) =>
    component
      .map((item) => item.id)
      .sort((left, right) => (left < right ? -1 : 1))
      .join(" ");
  components.sort(
    (left, right) =>
      right.length - left.length || (componentKey(left) < componentKey(right) ? -1 : 1),
  );

  const positions = new Map<string, { x: number; y: number }>();
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  components.forEach((component, componentIndex) => {
    const componentIds = new Set(component.map((item) => item.id));
    const componentEdges = validEdges
      .filter((edge) => componentIds.has(edge.source) && componentIds.has(edge.target))
      .sort((left, right) => (left.id < right.id ? -1 : 1));
    const local = simulateComponent(component, radii, componentEdges, componentIndex * 1.7);
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const item of component) {
      const center = local.get(item.id) || { x: 0, y: 0 };
      const radius = radii.get(item.id) || 20;
      const labelAllowance = radius + 26;
      minX = Math.min(minX, center.x - radius);
      minY = Math.min(minY, center.y - radius);
      maxX = Math.max(maxX, center.x + radius);
      maxY = Math.max(maxY, center.y + labelAllowance);
    }
    const width = maxX - minX;
    const height = maxY - minY;
    if (cursorX > 0 && cursorX + width > PACK_ROW_WIDTH) {
      cursorX = 0;
      cursorY += rowHeight + COMPONENT_GAP;
      rowHeight = 0;
    }
    for (const item of component) {
      const center = local.get(item.id) || { x: 0, y: 0 };
      positions.set(item.id, {
        x: center.x - minX + cursorX,
        y: center.y - minY + cursorY,
      });
    }
    cursorX += width + COMPONENT_GAP;
    rowHeight = Math.max(rowHeight, height);
  });
  return { positions, radii };
}

export function filterGraphNodes(items: GraphNode[], query: string): GraphNode[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return items;
  return items.filter((item) =>
    [
      item.label,
      item.subtitle,
      nodeTypeLabels[item.nodeType],
      translate(nodeTypeLabels[item.nodeType], "en-US"),
      translate(item.subtitle, "en-US"),
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalized),
  );
}

export function getGraphConnections(data: GraphData, nodeId: string): GraphConnection[] {
  const nodesById = new Map(data.nodes.map((node) => [node.id, node]));
  return data.edges.flatMap<GraphConnection>((edge): GraphConnection[] => {
    if (edge.source === nodeId) {
      const node = nodesById.get(edge.target);
      return node ? [{ edge, node, direction: "outgoing" as const }] : [];
    }
    if (edge.target === nodeId) {
      const node = nodesById.get(edge.source);
      return node ? [{ edge, node, direction: "incoming" as const }] : [];
    }
    return [];
  });
}

type KnowledgeNodeData = {
  entity: GraphNode;
  radius: number;
  muted: boolean;
  focused: boolean;
  subtitle: string;
  icon: ReactNode;
};

type KnowledgeNode = Node<KnowledgeNodeData, "knowledge">;

function KnowledgeOrbNode({ data }: NodeProps<KnowledgeNode>) {
  const { entity, radius, muted, focused, subtitle, icon } = data;
  const classes = ["graph-orb"];
  if (focused) classes.push("graph-orb--focus");
  if (muted) classes.push("graph-orb--muted");
  const size = radius * 2;
  return (
    <div
      className={classes.join(" ")}
      style={
        {
          width: size,
          height: size,
          "--node-color": palette[entity.nodeType],
        } as CSSProperties
      }
      title={`${entity.label} · ${subtitle}`}
    >
      {/* 隐藏句柄：ResizeObserver 测量时会用 DOM 句柄覆盖 handleBounds，没有它会被写成 null 导致边消失。 */}
      <Handle
        type="target"
        position={Position.Top}
        className="graph-orb__handle"
        isConnectable={false}
      />
      <span className="graph-orb__mark graph-orb__mark--entity" aria-hidden="true">
        {icon}
      </span>
      <span className="graph-orb__label">{entity.label}</span>
      <Handle
        type="source"
        position={Position.Top}
        className="graph-orb__handle"
        isConnectable={false}
      />
    </div>
  );
}

const nodeTypes = { knowledge: KnowledgeOrbNode };

type KnowledgeEdgeData = {
  sourceRadius: number;
  targetRadius: number;
};

type KnowledgeEdge = Edge<KnowledgeEdgeData, "knowledge">;

function KnowledgeLinkEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  label,
  markerEnd,
  style,
  data,
}: EdgeProps<KnowledgeEdge>) {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const distance = Math.hypot(dx, dy) || 1;
  // 从圆心连线，再按两端半径裁掉被圆盘盖住的部分，让箭头落在目标圆边缘。
  const startTrim = Math.min((data?.sourceRadius || 20) + 3, distance / 2);
  const endTrim = Math.min((data?.targetRadius || 20) + 6, distance / 2);
  const x1 = sourceX + (dx / distance) * startTrim;
  const y1 = sourceY + (dy / distance) * startTrim;
  const x2 = targetX - (dx / distance) * endTrim;
  const y2 = targetY - (dy / distance) * endTrim;

  return (
    <>
      <BaseEdge
        path={`M ${x1},${y1} L ${x2},${y2}`}
        markerEnd={markerEnd}
        style={style}
        interactionWidth={16}
      />
      {label ? (
        <EdgeLabelRenderer>
          <span
            className="graph-edge__label"
            style={{
              transform: `translate(-50%, -50%) translate(${(x1 + x2) / 2}px, ${(y1 + y2) / 2}px)`,
            }}
          >
            {label}
          </span>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const edgeTypes = { knowledge: KnowledgeLinkEdge };

export function GraphView({ data, focusId, onFocus, onOpenNode }: GraphViewProps) {
  const { language, t } = useI18n();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [flow, setFlow] = useState<ReactFlowInstance<KnowledgeNode, KnowledgeEdge>>();
  const layout = useMemo(() => buildGraphLayout(data.nodes, data.edges), [data]);
  const matches = useMemo(() => filterGraphNodes(data.nodes, query), [data.nodes, query]);
  const matchedIds = useMemo(() => new Set(matches.map((node) => node.id)), [matches]);
  const selectedNode = useMemo(
    () => data.nodes.find((node) => node.id === focusId),
    [data.nodes, focusId],
  );
  const connections = useMemo(
    () => (focusId ? getGraphConnections(data, focusId) : []),
    [data, focusId],
  );
  const focusedNeighborhood = useMemo(
    () => new Set([focusId, ...connections.map((connection) => connection.node.id)]),
    [connections, focusId],
  );
  const subtitleFor = useCallback(
    (node: GraphNode) => {
      if (node.nodeType === "project") return t("产品");
      if (node.nodeType === "environment") return formatEnvironment(node.subtitle, language);
      if (node.nodeType === "service") return node.subtitle;
      return node.subtitle
        .split(" · ")
        .filter(Boolean)
        .map((part) =>
          assetKindCodes.has(part as AssetKind)
            ? t(KIND_LABELS[part as AssetKind])
            : formatEnvironment(part, language) || part,
        )
        .join(" · ");
    },
    [language, t],
  );

  const focusNode = useCallback(
    (id: string) => {
      onFocus(id);
      const target = flow?.getNode(id);
      if (target) {
        void flow?.fitView({ nodes: [target], padding: 0.7, maxZoom: 1.05, duration: 260 });
      }
    },
    [flow, onFocus],
  );

  const showGlobal = useCallback(() => {
    setQuery("");
    onFocus(undefined);
    void flow?.fitView({ padding: 0.12, maxZoom: 0.9, duration: 260 });
  }, [flow, onFocus]);

  const nodes = useMemo<KnowledgeNode[]>(() => {
    const hasQuery = query.trim().length > 0;
    return data.nodes.map((item) => {
      const radius = layout.radii.get(item.id) || 20;
      const center = layout.positions.get(item.id) || { x: 0, y: 0 };
      const GraphIcon =
        item.nodeType === "project"
          ? Boxes
          : item.nodeType === "service"
            ? ServerCog
            : item.nodeType === "environment"
              ? Layers3
              : KeyRound;
      const iconSize = Math.max(15, Math.round(radius * 0.62));
      return {
        id: item.id,
        type: "knowledge",
        position: { x: center.x - radius, y: center.y - radius },
        // 顶层 width/height 让小地图与 fitView 在首次测量前就有正确尺寸。
        width: radius * 2,
        height: radius * 2,
        // 声明式句柄：圆心锚点，边从这里裁剪起止，不依赖 DOM 测量。
        handles: [
          { id: null, type: "target", position: Position.Top, x: radius, y: radius },
          { id: null, type: "source", position: Position.Top, x: radius, y: radius },
        ],
        data: {
          entity: item,
          radius,
          focused: focusId === item.id,
          muted:
            Boolean(focusId && !focusedNeighborhood.has(item.id)) ||
            Boolean(hasQuery && !matchedIds.has(item.id)),
          subtitle: subtitleFor(item),
          icon: <GraphIcon size={iconSize} />,
        },
        style: { width: radius * 2, height: radius * 2, borderColor: palette[item.nodeType] },
      };
    });
  }, [data.nodes, focusId, focusedNeighborhood, layout, matchedIds, query, subtitleFor]);

  const edges = useMemo<KnowledgeEdge[]>(
    () =>
      data.edges.map((item) => {
        const connected = focusId === item.source || focusId === item.target;
        const color = connected ? "var(--forest)" : "var(--graph-line)";
        return {
          id: item.id,
          source: item.source,
          target: item.target,
          type: "knowledge",
          data: {
            sourceRadius: layout.radii.get(item.source) || 20,
            targetRadius: layout.radii.get(item.target) || 20,
          },
          markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13, color },
          zIndex: connected ? 2 : 0,
          style: {
            stroke: color,
            strokeWidth: connected ? 2.2 : 1.5,
            opacity: focusId && !connected ? 0.16 : 0.78,
          },
          label: connected ? t(item.label) : undefined,
        };
      }),
    [data.edges, focusId, layout.radii, t],
  );

  const openLabel = selectedNode
    ? selectedNode.nodeType === "asset"
      ? t("打开凭证详情")
      : t("打开产品详情")
    : "";

  return (
    <section className="graph-view">
      <header className="graph-head">
        <div>
          <h1>{t("关系图谱")}</h1>
          <p>{t("查看凭证之间的关联，以及产品、产品组成和环境如何使用它们。")}</p>
        </div>
        <div className="graph-head__actions">
          <div className="graph-search">
            <Search size={16} aria-hidden="true" />
            <label className="sr-only" htmlFor={searchId}>
              {t("搜索节点")}
            </label>
            <input
              id={searchId}
              name="graph-search"
              value={query}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && matches[0]) {
                  focusNode(matches[0].id);
                  setQuery("");
                }
                if (event.key === "Escape") setQuery("");
              }}
              placeholder={t("搜索凭证、产品、产品组成、环境…")}
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label={t("清除节点搜索")}>
                <X size={15} />
              </button>
            )}
            {query.trim() && (
              <div className="graph-search__results">
                <small>{t("{count} 个匹配节点", { count: matches.length })}</small>
                {matches.slice(0, 8).map((node) => (
                  <button
                    type="button"
                    key={node.id}
                    onClick={() => {
                      focusNode(node.id);
                      setQuery("");
                    }}
                  >
                    <i style={{ background: palette[node.nodeType] }} />
                    <span>
                      <strong>{node.label}</strong>
                      <small>
                        {t(nodeTypeLabels[node.nodeType])} · {subtitleFor(node)}
                      </small>
                    </span>
                  </button>
                ))}
                {matches.length === 0 && <p>{t("没有找到匹配节点")}</p>}
              </div>
            )}
          </div>
          <button type="button" className="secondary-button" onClick={showGlobal}>
            <Focus size={16} />
            {t("显示全局")}
          </button>
        </div>
      </header>
      {nodes.length === 0 ? (
        <div className="graph-empty">
          <Network size={32} />
          <h2>{t("还没有关系")}</h2>
          <p>{t("先添加凭证、产品并建立关联。")}</p>
        </div>
      ) : (
        <div className="graph-canvas">
          <ReactFlow<KnowledgeNode, KnowledgeEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.1, maxZoom: 0.9 }}
            minZoom={0.15}
            maxZoom={1.6}
            onInit={setFlow}
            onNodeClick={(_, node) => focusNode(node.id)}
            onNodeDoubleClick={(_, node) => onOpenNode(node.data.entity)}
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} />
            <MiniMap
              nodeColor={(node) => String(node.style?.borderColor || "#245d55")}
              maskColor="var(--minimap-mask)"
            />
            <Controls showInteractive={false} />
          </ReactFlow>

          {selectedNode && (
            <aside
              className="graph-inspector"
              aria-label={t("{title} 节点详情", { title: selectedNode.label })}
            >
              <header>
                <div>
                  <span style={{ color: palette[selectedNode.nodeType] }}>
                    {t(nodeTypeLabels[selectedNode.nodeType])}
                  </span>
                  <h2>{selectedNode.label}</h2>
                  <p>{selectedNode.subtitle ? subtitleFor(selectedNode) : t("暂无补充说明")}</p>
                  {selectedNode.status && <p>{t("到期：{date}", { date: selectedNode.status })}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => onFocus(undefined)}
                  aria-label={t("关闭节点详情")}
                >
                  <X size={17} />
                </button>
              </header>
              <div className="graph-inspector__summary">
                <span>
                  <small>{t("关联")}</small>
                  <strong>{connections.length}</strong>
                </span>
                <span>
                  <small>{t("来源")}</small>
                  <strong>
                    {connections.filter((item) => item.direction === "incoming").length}
                  </strong>
                </span>
                <span>
                  <small>{t("去向")}</small>
                  <strong>
                    {connections.filter((item) => item.direction === "outgoing").length}
                  </strong>
                </span>
              </div>
              <div className="graph-inspector__connections">
                <h3>{t("相关节点")}</h3>
                {connections.length === 0 ? (
                  <p>{t("当前节点还没有依赖关系。")}</p>
                ) : (
                  connections.map((connection) => (
                    <button
                      type="button"
                      key={connection.edge.id}
                      onClick={() => focusNode(connection.node.id)}
                    >
                      {connection.direction === "incoming" ? (
                        <ArrowDownLeft size={15} />
                      ) : (
                        <ArrowUpRight size={15} />
                      )}
                      <span>
                        <strong>{connection.node.label}</strong>
                        <small>
                          {t(connection.edge.label)} · {t(nodeTypeLabels[connection.node.nodeType])}
                        </small>
                      </span>
                    </button>
                  ))
                )}
              </div>
              <button
                type="button"
                className="primary-button graph-inspector__open"
                onClick={() => onOpenNode(selectedNode)}
              >
                {openLabel}
                <ExternalLink size={15} />
              </button>
            </aside>
          )}

          <div className="graph-legend">
            {(Object.keys(nodeTypeLabels) as GraphNode["nodeType"][]).map((nodeType) => (
              <span key={nodeType}>
                <i style={{ background: palette[nodeType] }} />
                {t(nodeTypeLabels[nodeType])}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
