import java.util.*;

public class BFS {

    public static void bfs(Map<Integer, List<Integer>> graph, int start) {
        Set<Integer> visited = new HashSet<>();
        Queue<Integer> queue = new LinkedList<>();

        visited.add(start);
        queue.offer(start);

        while (!queue.isEmpty()) {
            int node = queue.poll();
            System.out.print(node + " ");

            for (int neighbor : graph.getOrDefault(node, new ArrayList<>())) {
                if (!visited.contains(neighbor)) {
                    visited.add(neighbor);
                    queue.offer(neighbor);
                }
            }
        }
    }
    public class something {

        public static void dfsRecursive(Map<Integer, List<Integer>> graph, int start, Set<Integer> visited) {
            // Mark the current node as visited
            visited.add(start);
            System.out.print(start + " ");
    
            // Visit all unvisited neighbors
            for (int neighbor : graph.getOrDefault(start, new ArrayList<>())) {
                if (!visited.contains(neighbor)) {
                    dfsRecursive(graph, neighbor, visited);
                }
        
            }
        }
    }

    public static void main(String[] args) {
        Map<Integer, List<Integer>> graph = new HashMap<>();
        graph.put(0, Arrays.asList(1, 2));
        graph.put(1, Arrays.asList(0, 3, 4));
        graph.put(2, Arrays.asList(0, 5));
        graph.put(3, Arrays.asList(1));
        graph.put(4, Arrays.asList(1, 5));
        graph.put(5, Arrays.asList(2, 4));

        System.out.print("BFS starting from node 0: ");
        bfs(graph, 0);
    }
}