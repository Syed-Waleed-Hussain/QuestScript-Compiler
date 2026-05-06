class SemanticAnalyzer:
    def __init__(self, ast):
        self.ast = ast
        self.symbol_table = {}
        self.scenes = set()

    def analyze(self):
        print("  [Step 1] Scanning for scenes...")
        for node in self.ast['body']:
            if node['type'] == 'SceneNode':
                if node['name'] in self.scenes:
                    raise Exception(f"Semantic Error: Duplicate scene '{node['name']}'")
                self.scenes.add(node['name'])
                print(f"    - Found scene: '{node['name']}'")

        print("\n  [Step 2] Registering variables and checking logic...")
        for node in self.ast['body']:
            if node['type'] == 'VarDeclaration':
                self.symbol_table[node['name']] = node['value']
                print(f"    - Registered variable: '{node['name']}' with value '{node['value']}'")
            elif node['type'] == 'SceneNode':
                print(f"    - Checking statements in scene: '{node['name']}'")
                self.check_statements(node['statements'])
        
        return self.ast

    def check_statements(self, statements):
        for stmt in statements:
            if stmt['type'] in ['GotoNode', 'ChoiceNode']:
                if stmt['target'] not in self.scenes:
                    raise Exception(f"Semantic Error: Scene '{stmt['target']}' not found")
            
            elif stmt['type'] == 'SetNode':
                if stmt['variable'] not in self.symbol_table:
                    raise Exception(f"Semantic Error: Variable '{stmt['variable']}' not declared")
            
            if 'if_body' in stmt:
                self.check_statements(stmt['if_body'])
            if 'else_body' in stmt:
                self.check_statements(stmt['else_body'])