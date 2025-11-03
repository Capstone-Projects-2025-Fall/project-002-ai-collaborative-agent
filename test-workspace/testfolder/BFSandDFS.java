import java.util.*;

public class BFSandDFS {

    public static void bfs(Map<Integer, List<Integer>> graph, int start) {
        Set<Integer> visited = new HashSet<>();
        Queue<Integer> queue = new LinkedList<>();

        visited.add(start);
        queue.offer(start);

        System.out.print("BFS Order: ");
        while (!queue.isEmpty()) {
            int node = queue.poll();
            System.out.print(node + " ");

            for (int neighbor : graph.getOrDefault(node, Collections.emptyList())) {
                if (!visited.contains(neighbor)) {
                    visited.add(neighbor);
                    queue.offer(neighbor);
                }
            }
        }
        System.out.println();
    }

    public static void dfs(Map<Integer, List<Integer>> graph, int start) {
        Set<Integer> visited = new HashSet<>();
        Stack<Integer> stack = new Stack<>();
        stack.push(start);

        System.out.print("DFS Order: ");
        while (!stack.isEmpty()) {
            int node = stack.pop();
            if (!visited.contains(node)) {
                visited.add(node);
                System.out.print(node + " ");
                List<Integer> neighbors = new ArrayList<>(graph.getOrDefault(node, Collections.emptyList()));
                Collections.reverse(neighbors);
                for (int neighbor : neighbors) {
                    stack.push(neighbor);
                }
            }
        }
        System.out.println();
    }

    public static void main(String[] args) {
        Map<Integer, List<Integer>> graph = new HashMap<>();
        graph.put(0, Arrays.asList(1, 2));
        graph.put(1, Arrays.asList(0, 3, 4));
        graph.put(2, Arrays.asList(0, 5));
        graph.put(3, Arrays.asList(1));
        graph.put(4, Arrays.asList(1, 5));
        graph.put(5, Arrays.asList(2, 4));

        bfs(graph, 0);
        dfs(graph, 0);
    }
}
