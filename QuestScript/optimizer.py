class Optimizer:
    def __init__(self, ast):
        self.ast = ast

    def optimize(self):
        print("\n--- Phase 3.5: Optimization ---")
        scenes = {node['name']: node for node in self.ast['body'] if node['type'] == 'SceneNode'}
        if not scenes:
            return self.ast
        
        # ====================================================
        # OPTIMIZATION 1: DEAD CODE ELIMINATION
        # ====================================================
        start_scene = 'start' if 'start' in scenes else list(scenes.keys())[0]
        reachable = set()
    
        def visit(scene_name):
            if scene_name in reachable: return
            reachable.add(scene_name)
            
            scene = scenes.get(scene_name)
            if not scene: return
            
            def scan_stmts(stmts):
                for stmt in stmts:
                    if stmt['type'] in ['GotoNode', 'ChoiceNode']:
                        visit(stmt['target'])
                    elif stmt['type'] == 'IfNode':
                        scan_stmts(stmt.get('if_body', []))
                        scan_stmts(stmt.get('else_body', []))
            
            scan_stmts(scene['statements'])

        visit(start_scene)
        
        # Filter out the dead code
        optimized_body = []
        dead_scenes = []
        
        for node in self.ast['body']:
            if node['type'] == 'SceneNode':
                if node['name'] in reachable:
                    optimized_body.append(node)
                else:
                    dead_scenes.append(node['name'])
            else:
                optimized_body.append(node)
        
        if dead_scenes:
            print(f"  [!] Removed dead scenes (unreachable): {', '.join(dead_scenes)}")
        else:
            print("  [+] Dead Code Elimination: No dead scenes found.")


        # ====================================================
        # OPTIMIZATION 2: PEEPHOLE OPTIMIZATION
        # ====================================================
        def merge_prints(statements):
            optimized_stmts = []
            i = 0
            while i < len(statements):
                stmt = statements[i]
                if stmt['type'] == 'PrintNode':
                    merged_args = stmt['args'].copy()
                    j = i + 1
                    while j < len(statements) and statements[j]['type'] == 'PrintNode':
                        merged_args.extend(statements[j]['args'])
                        j += 1
                    optimized_stmts.append({"type": "PrintNode", "args": merged_args})
                    i = j  # Skip past all the merged nodes
                elif stmt['type'] == 'IfNode':
                    stmt['if_body'] = merge_prints(stmt.get('if_body', []))
                    stmt['else_body'] = merge_prints(stmt.get('else_body', []))
                    optimized_stmts.append(stmt)
                    i += 1
                else:
                    optimized_stmts.append(stmt)
                    i += 1
            return optimized_stmts

        print("  [+] Peephole Optimization: Merged consecutive print statements.")
        for node in optimized_body:
            if node['type'] == 'SceneNode':
                node['statements'] = merge_prints(node['statements'])

        self.ast['body'] = optimized_body
        return self.ast
