import sys

class Parser:
    def __init__(self, tokens):
        self.tokens = tokens
        self.pos = 0

    def match(self, ttype):
        if self.pos < len(self.tokens) and self.tokens[self.pos].type == ttype:
            token = self.tokens[self.pos]
            self.pos += 1
            return token
        return None

    def peek(self, ttype):
        return self.pos < len(self.tokens) and self.tokens[self.pos].type == ttype

    def error(self, msg):
        token = self.tokens[self.pos] if self.pos < len(self.tokens) else self.tokens[-1]
        raise Exception(f"{msg} at line {token.line}, column {token.column}")

    def parse_program(self):
        """Root node for AST"""
        ast = {"type": "Program", "body": []}
        while self.pos < len(self.tokens):
            if self.peek('VAR'):
                ast["body"].append(self.parse_var())
            elif self.peek('SCENE'):
                ast["body"].append(self.parse_scene())
            else:
                break
        return ast

    def parse_var(self):
        self.match('VAR')
        name = self.match('ID')
        if not name: self.error("Expected variable name")
        self.match('ASSIGN')
        # Value can be String, Number, or Boolean 
        val = self.tokens[self.pos].value
        self.pos += 1
        self.match('SEMI')
        return {"type": "VarDeclaration", "name": name.value, "value": val}

    def parse_scene(self):
        self.match('SCENE')
        name = self.match('ID')
        if not name: self.error("Expected scene name")
        self.match('LBRACE')
        body = []
        while self.pos < len(self.tokens) and not self.peek('RBRACE'):
            body.append(self.parse_stmt())
        if not self.match('RBRACE'): self.error("Expected '}' at end of scene")
        return {"type": "SceneNode", "name": name.value, "statements": body}

    def parse_stmt(self):
        if self.peek('PRINT'): return self.parse_print()
        if self.peek('CHOICE'): return self.parse_choice()
        if self.peek('GOTO'): return self.parse_goto()
        if self.peek('SET'): return self.parse_set()
        if self.peek('IF'): return self.parse_if()
        if self.peek('END'):
            self.match('END')
            self.match('SEMI')
            return {"type": "EndNode"}
        self.error(f"Unknown statement: {self.tokens[self.pos].value}")

    def parse_print(self):
        self.match('PRINT')
        self.match('LPAREN')
        args = []
        # First argument 
        args.append(self.tokens[self.pos].value); self.pos += 1
        # More arguments with comma
        while self.match('COMMA'):
            args.append(self.tokens[self.pos].value); self.pos += 1
        self.match('RPAREN')
        self.match('SEMI')
        return {"type": "PrintNode", "args": args}

    def parse_choice(self):
        self.match('CHOICE')
        text = self.match('STRING').value
        self.match('ARROW')
        target = self.match('ID').value
        self.match('SEMI')
        return {"type": "ChoiceNode", "text": text, "target": target}

    def parse_goto(self):
        self.match('GOTO')
        target = self.match('ID').value
        self.match('SEMI')
        return {"type": "GotoNode", "target": target}

    def parse_set(self):
        self.match('SET')
        var_name = self.match('ID').value
        self.match('ASSIGN')
        val = self.tokens[self.pos].value; self.pos += 1
        self.match('SEMI')
        return {"type": "SetNode", "variable": var_name, "new_value": val}

    def parse_if(self):
        """Fixed logic to handle IF and optional ELSE [cite: 19, 51]"""
        self.match('IF')
        var = self.match('ID').value
        self.match('EQ')
        val = self.tokens[self.pos].value; self.pos += 1
        self.match('LBRACE')
        if_body = []
        while not self.peek('RBRACE'):
            if_body.append(self.parse_stmt())
        self.match('RBRACE')
        
        else_body = []
        if self.match('ELSE'):
            self.match('LBRACE')
            while not self.peek('RBRACE'):
                else_body.append(self.parse_stmt())
            self.match('RBRACE')
            
        return {
            "type": "IfNode", 
            "condition": f"{var} == {val}", 
            "if_body": if_body, 
            "else_body": else_body
        }