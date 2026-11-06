import { describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode } from "../types";
import { buildGraphLayout, filterGraphNodes, getGraphConnections } from "./GraphView";

const chainNodes: GraphNode[] = [
  { id: "service-1", nodeType: "service", label: "OCR", subtitle: "产品组成" },
  { id: "asset-key", nodeType: "asset", label: "OCR Key", subtitle: "api_credential" },
  { id: "environment-1", nodeType: "environment", label: "Prod", subtitle: "环境" },
  { id: "platform-1", nodeType: "platform", label: "阿里云", subtitle: "平台账号" },
  { id: "asset-account", nodeType: "asset", label: "阿里云账号", subtitle: "web_account" },
  { id: "project-1", nodeType: "project", label: "票据识别", subtitle: "产品" },
];

const chainEdges: GraphEdge[] = [
  { id: "platform", source: "platform-1", target: "asset-account", label: "签发" },
  { id: "child", source: "asset-account", target: "asset-key", label: "子凭证" },
  { id: "uses", source: "asset-key", target: "project-1", label: "使用" },
  { id: "contains", source: "project-1", target: "service-1", label: "包含" },
  { id: "deploys", source: "service-1", target: "environment-1", label: "部署" },
];

function distanceOf(
  positions: Map<string, { x: number; y: number }>,
  a: string,
  b: string,
): number {
  const left = positions.get(a);
  const right = positions.get(b);
  if (!left || !right) return Number.NaN;
  return Math.hypot(left.x - right.x, left.y - right.y);
}

describe("graph layout", () => {
  it("produces the same positions for the same input", () => {
    const first = buildGraphLayout(chainNodes, chainEdges);
    const second = buildGraphLayout([...chainNodes].reverse(), [...chainEdges].reverse());
    for (const node of chainNodes) {
      expect(second.positions.get(node.id)).toEqual(first.positions.get(node.id));
      expect(second.radii.get(node.id)).toBe(first.radii.get(node.id));
    }
  });

  it("keeps circular nodes free of overlaps", () => {
    const { positions, radii } = buildGraphLayout(chainNodes, chainEdges);
    for (let i = 0; i < chainNodes.length; i++) {
      for (let j = i + 1; j < chainNodes.length; j++) {
        const a = chainNodes[i];
        const b = chainNodes[j];
        const separation = distanceOf(positions, a.id, b.id);
        const minimum = (radii.get(a.id) || 0) + (radii.get(b.id) || 0);
        expect(separation).toBeGreaterThanOrEqual(minimum - 0.001);
      }
    }
  });

  it("pulls connected nodes closer than unconnected ones", () => {
    const { positions } = buildGraphLayout(chainNodes, chainEdges);
    const edgeLengths = chainEdges.map((edge) => distanceOf(positions, edge.source, edge.target));
    const meanEdge = edgeLengths.reduce((sum, value) => sum + value, 0) / edgeLengths.length;

    const pairLengths: number[] = [];
    for (let i = 0; i < chainNodes.length; i++) {
      for (let j = i + 1; j < chainNodes.length; j++) {
        const idPair = [chainNodes[i].id, chainNodes[j].id];
        if (chainEdges.some((edge) => idPair.includes(edge.source) && idPair.includes(edge.target)))
          continue;
        pairLengths.push(distanceOf(positions, chainNodes[i].id, chainNodes[j].id));
      }
    }
    const meanPair = pairLengths.reduce((sum, value) => sum + value, 0) / pairLengths.length;
    expect(meanEdge).toBeLessThan(meanPair);
  });

  it("hubs grow with their connection count", () => {
    const hubNodes: GraphNode[] = [
      { id: "platform", nodeType: "platform", label: "平台", subtitle: "平台账号" },
      ...[1, 2, 3, 4].map((index) => ({
        id: `asset-${index}`,
        nodeType: "asset" as const,
        label: `凭证 ${index}`,
        subtitle: "api_credential",
      })),
    ];
    const hubEdges = hubNodes.slice(1).map((asset) => ({
      id: `issue-${asset.id}`,
      source: "platform",
      target: asset.id,
      label: "签发",
    }));
    const { radii } = buildGraphLayout(hubNodes, hubEdges);
    const hubRadius = radii.get("platform") || 0;
    for (const asset of hubNodes.slice(1)) {
      expect(hubRadius).toBeGreaterThan(radii.get(asset.id) || 0);
    }
  });

  it("keeps separate relationships apart", () => {
    const nodes: GraphNode[] = [
      { id: "platform-a", nodeType: "platform", label: "A", subtitle: "平台" },
      { id: "asset-a", nodeType: "asset", label: "A Key", subtitle: "凭证" },
      { id: "platform-b", nodeType: "platform", label: "B", subtitle: "平台" },
      { id: "asset-b", nodeType: "asset", label: "B Key", subtitle: "凭证" },
    ];
    const edges = [
      { id: "a", source: "platform-a", target: "asset-a", label: "提供" },
      { id: "b", source: "platform-b", target: "asset-b", label: "提供" },
    ];
    const { positions } = buildGraphLayout(nodes, edges);
    const partner = distanceOf(positions, "platform-a", "asset-a");
    for (const foreign of ["platform-b", "asset-b"]) {
      expect(distanceOf(positions, "platform-a", foreign)).toBeGreaterThan(partner);
    }
  });

  it("searches node labels, subtitles, and localized types", () => {
    const nodes: GraphNode[] = [
      { id: "asset-1", nodeType: "asset", label: "DeepSeek API", subtitle: "api_credential" },
      { id: "service-1", nodeType: "service", label: "OCR worker", subtitle: "AI 合规检测" },
    ];

    expect(filterGraphNodes(nodes, "DeepSeek").map((node) => node.id)).toEqual(["asset-1"]);
    expect(filterGraphNodes(nodes, "合规").map((node) => node.id)).toEqual(["service-1"]);
    expect(filterGraphNodes(nodes, "凭证").map((node) => node.id)).toEqual(["asset-1"]);
    expect(filterGraphNodes(nodes, "产品组成").map((node) => node.id)).toEqual(["service-1"]);
  });

  it("builds the selected node detail from incoming and outgoing edges", () => {
    const nodes: GraphNode[] = [
      { id: "platform-1", nodeType: "platform", label: "Google", subtitle: "平台账号" },
      { id: "asset-1", nodeType: "asset", label: "Gemini API", subtitle: "API 凭证" },
      { id: "project-1", nodeType: "project", label: "AI 检测", subtitle: "产品" },
    ];
    const connections = getGraphConnections(
      {
        nodes,
        edges: [
          { id: "issued", source: "platform-1", target: "asset-1", label: "签发" },
          { id: "used", source: "asset-1", target: "project-1", label: "调用" },
        ],
      },
      "asset-1",
    );

    expect(connections.map((item) => [item.node.id, item.direction, item.edge.label])).toEqual([
      ["platform-1", "incoming", "签发"],
      ["project-1", "outgoing", "调用"],
    ]);
  });
});
