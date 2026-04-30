from semantic import SemanticAnalyzer
from optimizer import Optimizer
from vm import VirtualMachine
import sys
from lexer import tokenize
from parser import Parser
def print_tree(data, indent=0):
    spacing = "  " * indent
    if isinstance(data, list):
        for item in data:
            if isinstance(item, (dict, list)): 
                print_tree(item, indent)
            else: 
                print(f"{spacing}  - {item}") 
    elif isinstance(data, dict):
        for key, value in data.items():
            if key == "type":
                print(f"{spacing}node: {value}")
            elif isinstance(value, (dict, list)):
                print(f"{spacing}[{key}]")
                print_tree(value, indent + 1)
            else:
                print(f"{spacing}  - {key}: {value}")

def main():
    if len(sys.argv) < 2:
        print("Usage: python main.py <filename.adv>")
        return

    filename = sys.argv[1]
    if not filename.endswith('.adv'):
        print("Error: QuestScript source files must have .adv extension.")
        return

    try:
        with open(filename, 'r') as file:
            code = file.read()
        
        print(f"--- Compiling: {filename} ---")
        
        tokens = tokenize(code)
        print("\n--- Phase 1: Lexical Analysis (Tokens) ---")
        for t in tokens:
            print(t)
        
        parser = Parser(tokens)
        ast = parser.parse_program()
        print("\n--- Phase 2: Syntax Analysis (AST) ---")
        print_tree(ast)
        
        print("\n--- Phase 3: Semantic Analysis Working ---")
        analyzer = SemanticAnalyzer(ast)
        verified_ast = analyzer.analyze()
        print("\nSemantic Analysis OK")

        optimizer = Optimizer(verified_ast)
        optimized_ast = optimizer.optimize()

        print("\n--- Phase 4: Code Generation (Virtual Machine) ---")
        vm = VirtualMachine(optimized_ast)
        vm.run()

    except Exception as e:
        print(f"\n--- Compilation Error ---")
        print(f"Message: {e}")

if __name__ == "__main__":
    main()