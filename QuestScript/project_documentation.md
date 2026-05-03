# QuestScript Compiler & Virtual Machine
### Project Documentation — Compiler Construction (CS-310)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Language Specification](#2-language-specification)
3. [Overall Architecture](#3-overall-architecture)
4. [Phase 1 — Lexical Analysis (`lexer.py`)](#4-phase-1--lexical-analysis-lexerpy)
5. [Phase 2 — Syntax Analysis (`parser.py`)](#5-phase-2--syntax-analysis-parserpy)
6. [Phase 3 — Semantic Analysis (`semantic.py`)](#6-phase-3--semantic-analysis-semanticpy)
7. [Phase 3.5 — Optimization (`optimizer.py`)](#7-phase-35--optimization-optimizerpy)
8. [Phase 4 — Code Generation & VM (`vm.py`)](#8-phase-4--code-generation--virtual-machine-vmpy)
9. [Entry Point (`main.py`)](#9-entry-point-mainpy)
10. [Sample Program (`game.adv`)](#10-sample-program-gameadv)
11. [File Structure Summary](#11-file-structure-summary)
12. [Data-Flow Diagram](#12-data-flow-diagram)
13. [Key Design Decisions](#13-key-design-decisions)
14. [Known Limitations & Future Work](#14-known-limitations--future-work)

---

## 1. Project Overview

**QuestScript** is a custom-designed, domain-specific programming language (DSL) built exclusively for authoring interactive text-adventure games. The project implements a **complete five-phase compiler pipeline** — from raw source text all the way through to interactive game execution — entirely in Python, with no third-party compiler frameworks (e.g., ANTLR, PLY) used.

The compiler follows the classical textbook model:

```
Source Code (.adv)
      │
      ▼
 Lexical Analysis      ←  lexer.py
      │  tokens[]
      ▼
 Syntax Analysis       ←  parser.py
      │  AST (dict)
      ▼
 Semantic Analysis     ←  semantic.py
      │  verified AST
      ▼
 Optimization          ←  optimizer.py
      │  optimized AST
      ▼
 Code Generation / VM  ←  vm.py
      │
      ▼
 Interactive Game Output
```

The entire project demonstrates mastery of:

- **Regular expression**-based tokenization
- **Recursive descent parsing** without parser generators
- **Symbol table construction** and semantic validation
- **Static analysis optimizations** (Dead Code Elimination, Peephole)
- **Tree-walking interpreter** as a Virtual Machine

---

## 2. Language Specification

QuestScript source files use the `.adv` file extension. The language supports the following constructs:

| Construct | Syntax | Purpose |
|---|---|---|
| Variable declaration | `var name = value;` | Declare a boolean/string variable |
| Scene definition | `scene name { ... }` | Named block of statements |
| Print statement | `print("text");` | Display text to the player |
| Choice prompt | `choice "label" -> target;` | Present an interactive option |
| Conditional | `if var == val { } else { }` | Branch on variable value |
| Assignment | `set var = value;` | Mutate an existing variable |
| Jump | `goto scene_name;` | Unconditional scene transition |
| Termination | `end;` | End the game |
| Comments | `// text` | Single-line comments (ignored) |

**Example snippet (`game.adv`):**
```
var has_key = false;

scene start {
    print("You wake up in a dark room.");
    choice "Search the floor" -> find_key;
    choice "Try the door"     -> check_door;
}
```

---

## 3. Overall Architecture

The compiler is structured as a **linear pipeline** where each phase consumes the output of the previous one:

```
┌────────────────────────────────────────────────────────────────┐
│                        main.py (Orchestrator)                  │
│                                                                │
│  ┌──────────┐   tokens   ┌──────────┐   AST    ┌───────────┐  │
│  │ lexer.py │──────────▶ │ parser.py│─────────▶│semantic.py│  │
│  └──────────┘            └──────────┘          └─────┬─────┘  │
│                                                       │ AST    │
│                                               ┌───────▼──────┐ │
│                                               │optimizer.py  │ │
│                                               └───────┬──────┘ │
│                                                       │ AST    │
│                                               ┌───────▼──────┐ │
│                                               │    vm.py     │ │
│                                               └──────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

All intermediate representations (tokens, AST) are **pure Python data structures** — lists of `Token` objects and nested dictionaries respectively. No binary bytecode is generated; the VM directly interprets the AST (a **tree-walking interpreter**).

---

## 4. Phase 1 — Lexical Analysis (`lexer.py`)

### 4.1 Responsibility

The **Lexer** (also called a *Scanner* or *Tokenizer*) reads the raw source code string and breaks it into a flat, ordered sequence of meaningful units called **tokens**. It strips away whitespace and comments, which carry no semantic meaning.

### 4.2 Token Structure

Each token is represented by an instance of the `Token` class:

```python
class Token:
    def __init__(self, type, value, line, column):
        self.type   = type    # e.g., 'KEYWORD', 'ID', 'STRING'
        self.value  = value   # e.g., 'scene', 'start', 'You wake up'
        self.line   = line    # 1-indexed source line number
        self.column = column  # 1-indexed column offset
```

The `__repr__` method formats each token as:
```
Token(VAR, 'var', Line: 2, Col: 1)
```

### 4.3 Tokenization Technique — Master Regex

Rather than iterating character-by-character, the lexer uses Python's `re` module to define a **single composite regular expression** called `MASTER_REGEX`. Each token type is defined as a named capture group:

```python
TOKEN_SPECIFICATION = [
    ('COMMENT', r'//.*'),
    ('KEYWORD', r'\b(scene|choice|var|if|else|goto|print|end|set|true|false)\b'),
    ('NUMBER',  r'\d+'),
    ('ID',      r'[a-zA-Z_][a-zA-Z0-9_]*'),
    ('STRING',  r'"[^"]*"'),
    ('ARROW',   r'->'),
    ('EQ',      r'=='),
    # ... punctuation tokens ...
    ('NEWLINE', r'\n'),
    ('SKIP',    r'[ \t]+'),
    ('MISMATCH',r'.'),
]

MASTER_REGEX = '|'.join(f'(?P<{name}>{pattern})' for name, pattern in TOKEN_SPECIFICATION)
```

`re.finditer(MASTER_REGEX, code)` scans the entire source in a single pass, yielding one match object per token. The `lastgroup` attribute of each match identifies which named group matched.

### 4.4 Line & Column Tracking

The lexer manually tracks the current line number and line-start offset:

```python
elif kind == 'NEWLINE':
    line_start = mo.end()   # next char index becomes column 1
    line_num += 1
```

Column is computed as: `column = mo.start() - line_start + 1`.

This produces precise error messages pointing to the exact location of lexical errors (e.g., unexpected characters matched by `MISMATCH`).

### 4.5 Keyword Disambiguation

All keywords (`scene`, `var`, `if`, etc.) are matched **before** identifiers in the specification list. Because regex alternation is ordered, `KEYWORD` will match `scene` before `ID` can claim it. The matched keyword's `.upper()` form becomes the token type, so `scene` → type `SCENE`.

### 4.6 Output

The lexer returns a Python `list` of `Token` objects, ordered as they appear in the source. This list is passed directly to the parser.

---

## 5. Phase 2 — Syntax Analysis (`parser.py`)

### 5.1 Responsibility

The **Parser** takes the flat token list from the lexer and builds a hierarchical **Abstract Syntax Tree (AST)**. The AST encodes the grammatical structure of the program — which tokens form which constructs — discarding syntactically meaningless tokens (braces, semicolons, parentheses).

### 5.2 Technique — Recursive Descent Parsing

The parser implements **Recursive Descent Parsing (RDP)** — a top-down, hand-written technique where each grammar rule is implemented as a method. No parser generator (ANTLR, PLY, Yacc) is used.

The grammar implemented is approximately:

```
program     → (var_decl | scene_def)*
var_decl    → 'var' ID '=' value ';'
scene_def   → 'scene' ID '{' statement* '}'
statement   → print_stmt | choice_stmt | goto_stmt | set_stmt | if_stmt | end_stmt
print_stmt  → 'print' '(' value (',' value)* ')' ';'
choice_stmt → 'choice' STRING '->' ID ';'
goto_stmt   → 'goto' ID ';'
set_stmt    → 'set' ID '=' value ';'
if_stmt     → 'if' ID '==' value '{' statement* '}' ('else' '{' statement* '}')?
end_stmt    → 'end' ';'
```

### 5.3 Parser Internals

Two helper methods underpin the entire parser:

```python
def match(self, ttype):
    """Consume and return the next token if it matches ttype, else return None."""
    if self.pos < len(self.tokens) and self.tokens[self.pos].type == ttype:
        token = self.tokens[self.pos]
        self.pos += 1
        return token
    return None

def peek(self, ttype):
    """Look ahead without consuming — returns True/False."""
    return self.pos < len(self.tokens) and self.tokens[self.pos].type == ttype
```

`self.pos` is the current cursor index into the token list. Each `parse_*` method advances `self.pos` only through explicit `match()` calls, giving precise control over consumption.

### 5.4 AST Representation

The AST is represented as **nested Python dictionaries**. Every node has at minimum a `"type"` key. Additional keys carry node-specific attributes:

```python
# Program root
{ "type": "Program", "body": [ ...child nodes... ] }

# Variable declaration
{ "type": "VarDeclaration", "name": "has_key", "value": "false" }

# Scene node
{ "type": "SceneNode", "name": "start", "statements": [ ...] }

# Choice node
{ "type": "ChoiceNode", "text": "Search the floor", "target": "find_key" }

# If node (with optional else)
{ "type": "IfNode",
  "condition": "has_key == true",
  "if_body": [...],
  "else_body": [...] }
```

Using plain dicts (rather than custom classes) means the entire AST can be inspected, printed, and passed between phases with zero serialization overhead.

### 5.5 Error Handling

The `error()` method raises a Python `Exception` with the current token's line and column, providing informative parse errors:

```python
def error(self, msg):
    token = self.tokens[self.pos]
    raise Exception(f"{msg} at line {token.line}, column {token.column}")
```

---

## 6. Phase 3 — Semantic Analysis (`semantic.py`)

### 6.1 Responsibility

Syntactically valid programs can still be **semantically wrong** — for example, jumping to a scene that was never defined, or assigning to an undeclared variable. The **Semantic Analyzer** catches these logical errors by walking the verified AST and enforcing the language's type and scope rules.

### 6.2 Symbol Table

The analyzer maintains two primary data structures:

| Structure | Type | Contents |
|---|---|---|
| `self.symbol_table` | `dict` | Maps variable names → initial values |
| `self.scenes` | `set` | Names of all declared scenes |

These are populated in **two passes** over the AST body:

**Pass 1 — Scene Registration**
```python
for node in self.ast['body']:
    if node['type'] == 'SceneNode':
        if node['name'] in self.scenes:
            raise Exception(f"Duplicate scene '{node['name']}'")
        self.scenes.add(node['name'])
```
All scene names are registered before any reference checks, so forward references (a scene jumping to one defined later) are valid.

**Pass 2 — Variable & Reference Checks**
```python
for node in self.ast['body']:
    if node['type'] == 'VarDeclaration':
        self.symbol_table[node['name']] = node['value']
    elif node['type'] == 'SceneNode':
        self.check_statements(node['statements'])
```

### 6.3 Statement Checking

`check_statements()` recursively validates every statement:

- **`GotoNode` / `ChoiceNode`** — verifies `target` exists in `self.scenes`
- **`SetNode`** — verifies `variable` exists in `self.symbol_table`
- **`IfNode`** — recursively checks both `if_body` and `else_body`

Any violation raises an exception that is caught by `main.py` and displayed as a `Compilation Error`.

---

## 7. Phase 3.5 — Optimization (`optimizer.py`)

### 7.1 Responsibility

The **Optimizer** applies machine-independent transformations to the verified AST, reducing unnecessary work before the VM executes it. Two optimizations are implemented.

### 7.2 Optimization 1 — Dead Code Elimination (DCE)

**Goal:** Remove scenes that can never be reached from the start scene.

**Algorithm:**
1. Assume `start` (or the first defined scene) is the entry point.
2. Perform a **graph traversal** (depth-first) following all `GotoNode` and `ChoiceNode` targets.
3. Any scene not in the reachable set is removed from `ast['body']`.

```python
def visit(scene_name):
    if scene_name in reachable: return
    reachable.add(scene_name)
    def scan_stmts(stmts):
        for stmt in stmts:
            if stmt['type'] in ['GotoNode', 'ChoiceNode']:
                visit(stmt['target'])
            elif stmt['type'] == 'IfNode':
                scan_stmts(stmt.get('if_body', []))
                scan_stmts(stmt.get('else_body', []))
    scan_stmts(scene['statements'])
```

Dead scenes are reported to stdout so the developer is informed of unreachable code.

### 7.3 Optimization 2 — Peephole Optimization (Print Merging)

**Goal:** Merge consecutive `PrintNode` statements into a single node to reduce VM dispatch overhead.

**Algorithm:** A linear scan over each scene's statement list:
- If a `PrintNode` is followed immediately by another `PrintNode`, their `args` lists are concatenated into one node.
- The merged node replaces the originals.

```python
while i < len(statements):
    stmt = statements[i]
    if stmt['type'] == 'PrintNode':
        merged_args = stmt['args'].copy()
        j = i + 1
        while j < len(statements) and statements[j]['type'] == 'PrintNode':
            merged_args.extend(statements[j]['args'])
            j += 1
        optimized_stmts.append({"type": "PrintNode", "args": merged_args})
        i = j
```

This optimization is applied **recursively** into `if_body` and `else_body` blocks.

---

## 8. Phase 4 — Code Generation & Virtual Machine (`vm.py`)

### 8.1 Responsibility

The **Virtual Machine (VM)** is the final phase — it executes the optimized AST directly. The execution model is a **Tree-Walking Interpreter**: rather than compiling to bytecode or machine code, the VM traverses AST nodes and performs their operations on-the-fly in Python.

### 8.2 VM State

The VM maintains two runtime state containers:

```python
self.variables    = {}   # Runtime variable store  { name: value }
self.scenes       = {}   # Scene lookup table       { name: SceneNode_dict }
self.current_scene = None  # Name of the active scene
```

### 8.3 Setup Phase

`setup()` pre-processes the AST before the game loop starts:
- Iterates `ast['body']`; populates `self.variables` from `VarDeclaration` nodes
- Populates `self.scenes` from `SceneNode` nodes
- Sets `self.current_scene = 'start'` (or first scene if no `start` exists)

### 8.4 The Main Game Loop

```python
while self.current_scene:
    scene = self.scenes.get(self.current_scene)
    next_scene = self.execute_statements(scene['statements'])
    if next_scene == 'END_GAME':
        break
    elif next_scene:
        self.current_scene = next_scene
    else:
        break   # Scene ended without a jump or choice
```

Each iteration executes one scene, then transitions to the next scene returned by `execute_statements()`.

### 8.5 Statement Dispatch Table

`execute_statements()` is the core of the VM. It loops over a list of statement dicts and dispatches based on the `type` field:

| Node Type | Action |
|---|---|
| `PrintNode` | Joins `args` with spaces and calls `print()` |
| `SetNode` | Updates `self.variables[variable] = new_value` |
| `GotoNode` | Returns the `target` scene name immediately (early exit) |
| `ChoiceNode` | Appends to a local `choices[]` list for deferred prompt |
| `EndNode` | Returns the sentinel string `'END_GAME'` |
| `IfNode` | Calls `eval_condition()`, then recurses into `if_body` or `else_body` |

### 8.6 Condition Evaluation

```python
def eval_condition(self, condition_str):
    parts = condition_str.split('==')   # e.g. "has_key == true"
    var_name   = parts[0].strip()
    target_val = parts[1].strip()
    current_val = str(self.variables.get(var_name, "")).lower()
    return current_val == target_val.lower()
```

String comparison (lowercased) avoids Python type-casting pitfalls between `"true"` (string) and `True` (bool).

### 8.7 Interactive Choice Prompt

When one or more `ChoiceNode` statements have been collected after processing a scene, the VM presents an interactive menu:

```
  [1] Search the floor
  [2] Try the door

What do you do? > _
```

The user's input is read via `input()`, explicitly echoed back to stdout (required when stdin is a pipe, not a TTY), and validated as an integer in range. Invalid input loops without crashing. The selected choice's `target` scene name is returned, becoming `next_scene` in the game loop.

---

## 9. Entry Point (`main.py`)

`main.py` is the **orchestrator**. It:

1. Validates command-line arguments (`sys.argv[1]` must end in `.adv`)
2. Reads the source file
3. Calls each phase in order, threading the output of one into the next
4. Wraps everything in a `try/except` to catch and display any compilation or runtime error gracefully

It also contains the standalone `print_tree(data, indent=0)` utility, which pretty-prints any nested dict/list AST structure to the terminal for Phase 2 output.

```
python main.py game.adv
```

**Phase output markers printed to stdout:**

```
--- Compiling: game.adv ---
--- Phase 1: Lexical Analysis (Tokens) ---
--- Phase 2: Syntax Analysis (AST) ---
--- Phase 3: Semantic Analysis Working ---
--- Phase 3.5: Optimization ---
--- Phase 4: Code Generation (Virtual Machine) ---
```

---

## 10. Sample Program (`game.adv`)

```questscript
// Simple escape room logic in QuestScript
var has_key = false;

scene start {
    print("You wake up in a dark room.");
    choice "Search the floor" -> find_key;
    choice "Try the door"     -> check_door;
}

scene find_key {
    set has_key = true;
    print("You found a rusty key!");
    goto start;
}

scene check_door {
    if has_key == true {
        print("Door unlocked. You escaped!");
        end;
    } else {
        print("The door is locked.");
        goto start;
    }
}
```

**Narrative flow:**

```
start ──[1]──▶ find_key ──(goto)──▶ start
  │
  └──[2]──▶ check_door ──(if true)──▶ END
                        └──(else)──▶ start
```

---

## 11. File Structure Summary

```
Project/
│
├── main.py          Orchestrator: reads .adv file, runs all 5 phases in order
├── lexer.py         Phase 1: Tokenizer using master regex + line/column tracking
├── parser.py        Phase 2: Recursive descent parser producing nested dict AST
├── semantic.py      Phase 3: Symbol table + scope checker (scenes, variables)
├── optimizer.py     Phase 3.5: Dead Code Elimination + Peephole print-merging
├── vm.py            Phase 4: Tree-walking interpreter / Virtual Machine
│
├── game.adv         Sample QuestScript source file (escape room demo)
│
├── app.py           Web UI backend (Flask): subprocess wrapper + SSE streaming
├── index.html       Web UI: 3-panel IDE layout (Logs, AST Visualizer, Game Engine)
├── styles.css       Web UI: dark IDE theme (CSS custom properties + animations)
├── script.js        Web UI: SSE client, D3.js AST renderer, game I/O
└── d3.min.js        D3.js v7 (local copy, no CDN dependency)
```

---

## 12. Data-Flow Diagram

```
game.adv  (raw text)
    │
    │  code: str
    ▼
┌────────────────────────────────────┐
│  lexer.tokenize(code)              │
│  ─ Master regex scan               │
│  ─ Token(type, value, line, col)   │
└────────────────────┬───────────────┘
                     │  List[Token]
                     ▼
┌────────────────────────────────────┐
│  Parser(tokens).parse_program()    │
│  ─ Recursive descent               │
│  ─ { "type": "Program",            │
│      "body": [...] }               │
└────────────────────┬───────────────┘
                     │  ast: dict
                     ▼
┌────────────────────────────────────┐
│  SemanticAnalyzer(ast).analyze()   │
│  ─ symbol_table: {var → val}       │
│  ─ scenes: {name}                  │
│  ─ Raises on undeclared refs       │
└────────────────────┬───────────────┘
                     │  verified_ast: dict
                     ▼
┌────────────────────────────────────┐
│  Optimizer(verified_ast).optimize()│
│  ─ Dead Code Elimination           │
│  ─ Peephole (print merging)        │
└────────────────────┬───────────────┘
                     │  optimized_ast: dict
                     ▼
┌────────────────────────────────────┐
│  VirtualMachine(ast).run()         │
│  ─ Scene dispatch loop             │
│  ─ Variable store: {var → val}     │
│  ─ Interactive input/output        │
└────────────────────┬───────────────┘
                     │
                     ▼
            Interactive Game Output
```

---

## 13. Key Design Decisions

### Why Python Dicts for the AST?

Python dictionaries are dynamically typed, require no class definitions per node type, and are natively serializable to JSON. This makes it trivial to inspect, print, and pass the AST between phases. The trade-off is that there is no static type safety at the AST level — a misspelled key silently returns `None`. This is acceptable for an educational project where the schema is known and controlled.

### Why a Tree-Walking Interpreter (No Bytecode)?

Generating bytecode (like Python's own `.pyc` files) would add significant complexity (a bytecode definition, an assembler, a stack machine) without proportional educational benefit. The tree-walking interpreter is transparent — every execution step directly corresponds to a visible AST node — making it ideal for demonstrating compiler concepts.

### Why Recursive Descent (No Parser Generator)?

Hand-written RDP makes every parsing rule explicit and readable. A professor or student can map each `parse_*` method directly to a grammar production rule. Parser generators like ANTLR or PLY abstract this mapping away, reducing pedagogical clarity.

### Why a Single Master Regex?

Using a single compiled `re.finditer` call is significantly faster than iterating character-by-character or using multiple `re.match` calls in a loop. The Python regex engine executes a single NFA pass over the source string, making the lexer O(n) in input size.

---

## 14. Known Limitations & Future Work

| Limitation | Potential Enhancement |
|---|---|
| Variables are untyped (all values stored as strings) | Add a type system with integers, booleans, strings |
| No nested if statements (single level only) | Generalize `parse_if` to support arbitrary nesting |
| No function/procedure definitions | Add callable scenes with parameter passing |
| No array or record types | Add composite data structures for inventory systems |
| Error recovery is not implemented | Add synchronization points for multi-error reporting |
| No bytecode compilation | Compile AST to a stack-based bytecode for faster execution |
| Web UI requires manual `python app.py` launch | Package as an Electron app or deploy to a web host |

---

*Documentation prepared for Compiler Construction (CS-310)*  
*FAST National University of Computer and Emerging Sciences*  
*Academic Year 2025–2026, Semester 6*
