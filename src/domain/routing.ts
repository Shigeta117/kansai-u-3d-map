import type {
  ElevationSample,
  LocalPoint3D,
  RouteMode,
  RouteResult,
  WalkEdge,
  WalkGraph,
} from './types';

interface HeapItem {
  nodeId: string;
  cost: number;
}

class MinHeap {
  private items: HeapItem[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: HeapItem): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): HeapItem | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last !== undefined) {
      this.items[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    let idx = index;
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      const current = this.items[idx];
      const parent = this.items[parentIdx];
      if (!current || !parent || current.cost >= parent.cost) break;
      this.items[idx] = parent;
      this.items[parentIdx] = current;
      idx = parentIdx;
    }
  }

  private sinkDown(index: number): void {
    let idx = index;
    const length = this.items.length;
    while (true) {
      const leftIdx = 2 * idx + 1;
      const rightIdx = 2 * idx + 2;
      let smallestIdx = idx;

      const current = this.items[smallestIdx];
      const left = leftIdx < length ? this.items[leftIdx] : undefined;
      const right = rightIdx < length ? this.items[rightIdx] : undefined;

      if (left && current && left.cost < current.cost) {
        smallestIdx = leftIdx;
      }
      const smallest = this.items[smallestIdx];
      if (right && smallest && right.cost < smallest.cost) {
        smallestIdx = rightIdx;
      }
      if (smallestIdx === idx) break;
      const swap = this.items[smallestIdx];
      const orig = this.items[idx];
      if (swap && orig) {
        this.items[idx] = swap;
        this.items[smallestIdx] = orig;
      }
      idx = smallestIdx;
    }
  }
}

export function computeEdgeCost(edge: WalkEdge, mode: RouteMode): number {
  const baseDist = Math.max(0.1, edge.dist);
  if (mode === 'shortest') {
    return baseDist;
  }
  if (edge.isSteps) {
    return baseDist * 4.5 + 35;
  }
  if (edge.slope > 0.06) {
    return baseDist * (1 + edge.slope * 14);
  }
  if (edge.slope < -0.08) {
    return baseDist * (1 + Math.abs(edge.slope) * 4);
  }
  return baseDist;
}

export function findNearestWalkNode(
  graph: WalkGraph,
  x: number,
  z: number,
): string | null {
  let bestId: string | null = null;
  let bestDistSq = Number.POSITIVE_INFINITY;

  for (const [id, node] of Object.entries(graph.nodes)) {
    const edges = graph.adjacency[id];
    if (!edges || edges.length === 0) continue;
    const dx = node.x - x;
    const dz = node.z - z;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestId = id;
    }
  }
  return bestId;
}

export function findRoute(
  graph: WalkGraph,
  fromNodeId: string,
  toNodeId: string,
  mode: RouteMode,
  fromId: string,
  toId: string,
): RouteResult | null {
  const startNode = graph.nodes[fromNodeId];
  const endNode = graph.nodes[toNodeId];
  if (!startNode || !endNode) {
    return null;
  }

  if (fromNodeId === toNodeId) {
    return {
      mode,
      fromId,
      toId,
      points: [{ x: startNode.x, y: startNode.y, z: startNode.z }],
      totalDistanceM: 0,
      estimatedMinutes: 0,
      elevationGainM: 0,
      elevationLossM: 0,
      stepsCount: 0,
      maxSlopeRatio: 0,
      profile: [
        {
          distanceM: 0,
          elevationM: startNode.y,
          isSteps: false,
        },
      ],
    };
  }

  const distCost = new Map<string, number>();
  const prevNode = new Map<string, string>();
  const prevEdge = new Map<string, WalkEdge>();
  const visited = new Set<string>();
  const heap = new MinHeap();

  distCost.set(fromNodeId, 0);
  heap.push({ nodeId: fromNodeId, cost: 0 });

  while (heap.size > 0) {
    const current = heap.pop();
    if (!current) break;
    const { nodeId, cost } = current;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    if (nodeId === toNodeId) {
      break;
    }

    const bestKnown = distCost.get(nodeId) ?? Number.POSITIVE_INFINITY;
    if (cost > bestKnown) continue;

    const neighbors = graph.adjacency[nodeId] ?? [];
    for (const edge of neighbors) {
      if (visited.has(edge.to)) continue;
      const nextCost = bestKnown + computeEdgeCost(edge, mode);
      const prevCost = distCost.get(edge.to) ?? Number.POSITIVE_INFINITY;
      if (nextCost < prevCost) {
        distCost.set(edge.to, nextCost);
        prevNode.set(edge.to, nodeId);
        prevEdge.set(edge.to, edge);
        heap.push({ nodeId: edge.to, cost: nextCost });
      }
    }
  }

  if (!prevNode.has(toNodeId)) {
    return null;
  }

  const pathIds: string[] = [];
  const edgesUsed: WalkEdge[] = [];
  let cursor: string | undefined = toNodeId;
  while (cursor !== undefined) {
    pathIds.push(cursor);
    if (cursor === fromNodeId) break;
    const edge = prevEdge.get(cursor);
    if (edge) edgesUsed.push(edge);
    cursor = prevNode.get(cursor);
  }
  pathIds.reverse();
  edgesUsed.reverse();

  const points: LocalPoint3D[] = [];
  const profile: ElevationSample[] = [];
  let totalDistanceM = 0;
  let elevationGainM = 0;
  let elevationLossM = 0;
  let stepsCount = 0;
  let maxSlopeRatio = 0;

  const first = graph.nodes[pathIds[0] ?? ''];
  if (!first) return null;

  points.push({ x: first.x, y: first.y, z: first.z });
  profile.push({
    distanceM: 0,
    elevationM: first.y,
    isSteps: false,
  });

  for (let i = 0; i < edgesUsed.length; i++) {
    const edge = edgesUsed[i];
    const nextId = pathIds[i + 1];
    const node = nextId ? graph.nodes[nextId] : undefined;
    if (!edge || !node) continue;

    totalDistanceM += edge.dist;
    if (edge.deltaY > 0) elevationGainM += edge.deltaY;
    else elevationLossM += Math.abs(edge.deltaY);
    if (edge.isSteps) stepsCount += 1;
    maxSlopeRatio = Math.max(maxSlopeRatio, Math.abs(edge.slope));

    points.push({ x: node.x, y: node.y, z: node.z });
    profile.push({
      distanceM: totalDistanceM,
      elevationM: node.y,
      isSteps: edge.isSteps,
    });
  }

  // Standard 75 m/min walking pace + climbing time factor
  const estimatedMinutes = Math.max(
    1,
    Math.round(totalDistanceM / 75 + elevationGainM / 12),
  );

  return {
    mode,
    fromId,
    toId,
    points,
    totalDistanceM,
    estimatedMinutes,
    elevationGainM,
    elevationLossM,
    stepsCount,
    maxSlopeRatio,
    profile,
  };
}

