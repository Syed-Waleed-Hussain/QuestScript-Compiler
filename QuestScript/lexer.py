import re
import sys

# Token definitions 
TOKEN_SPECIFICATION = [
    ('COMMENT',  r'//.*'),                   # Single-line comments
    ('KEYWORD',  r'\b(scene|choice|var|if|else|goto|print|end|set|true|false)\b'), 
    ('NUMBER',   r'\d+'),                    # Integer literals
    ('ID',       r'[a-zA-Z_][a-zA-Z0-9_]*'), # Identifiers (variables/scene names)
    ('STRING',   r'"[^"]*"'),                # String literals 
    ('ARROW',    r'->'),                     # Choice operator 
    ('EQ',       r'=='),                     # Comparison 
    ('ASSIGN',   r'='),                      # Assignment 
    ('LPAREN',   r'\('),                     # For print
    ('RPAREN',   r'\)'),                     # For print
    ('COMMA',    r','),                      # For multiple print arguments
    ('LBRACE',   r'\{'),                     # Scene start 
    ('RBRACE',   r'\}'),                     # Scene end 
    ('SEMI',     r';'),                      # Statement terminator 
    ('NEWLINE',  r'\n'),                     # For line tracking
    ('SKIP',     r'[ \t]+'),                 # Ignore whitespace
    ('MISMATCH', r'.'),                      # Lexical error
]

MASTER_REGEX = '|'.join(f'(?P<{name}>{pattern})' for name, pattern in TOKEN_SPECIFICATION)

class Token:
    def __init__(self, type, value, line, column):
        self.type = type
        self.value = value
        self.line = line
        self.column = column

    def __repr__(self):
        return f"Token({self.type}, {repr(self.value)}, Line: {self.line}, Col: {self.column})"

def tokenize(code):
    line_num = 1
    line_start = 0
    tokens = []

    for mo in re.finditer(MASTER_REGEX, code):
        kind = mo.lastgroup
        value = mo.group()
        column = mo.start() - line_start + 1

        if kind == 'KEYWORD':
            tokens.append(Token(value.upper(), value, line_num, column))
        elif kind == 'ID':
            tokens.append(Token('ID', value, line_num, column))
        elif kind == 'NUMBER':
            tokens.append(Token('NUMBER', int(value), line_num, column))
        elif kind == 'STRING':
            tokens.append(Token('STRING', value[1:-1], line_num, column))
        elif kind in ['ARROW', 'EQ', 'ASSIGN', 'LPAREN', 'RPAREN', 'COMMA', 'LBRACE', 'RBRACE', 'SEMI']:
            tokens.append(Token(kind, value, line_num, column))
        elif kind == 'NEWLINE':
            line_start = mo.end()
            line_num += 1
        elif kind == 'SKIP' or kind == 'COMMENT':
            continue
        elif kind == 'MISMATCH':
            print(f"Lexical Error: Unexpected character {repr(value)} at line {line_num}, column {column}")
            sys.exit(1)
            
    return tokens