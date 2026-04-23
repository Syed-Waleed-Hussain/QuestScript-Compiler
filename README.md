# 🎮 QuestScript: Interactive Fiction Compiler

> A custom text-adventure programming language compiler and virtual machine built from scratch in Python.

Developed as part of the **Compiler Construction** semester project at **FAST NUCES, Karachi**.

## 🚀 Overview
QuestScript is a domain-specific programming language designed for creating interactive text-adventure games. This repository contains the complete compiler pipeline, taking raw `.adv` source code through lexical analysis, parsing, semantic checking, optimization, and finally executing it via a custom Virtual Machine.

## 🏗️ Compiler Architecture

Our compiler follows a standard multi-phase pipeline:

### 1. Lexical Analysis (Scanner)
- **File:** `lexer.py`
- **Function:** Uses Regular Expressions to break down the source code into a stream of tokens.
- **Features:** Accurately tracks line and column numbers for precise syntax error reporting. Handles keywords (`scene`, `choice`, `var`, `if`, `goto`, `print`), identifiers, strings, and operators.

### 2. Syntax Analysis (Parser)
- **File:** `parser.py`
- **Function:** Implements a **Recursive Descent Parser** to validate the token stream against a custom Context-Free Grammar (CFG) ensuring no left-recursion.
- **Output:** Generates a highly structured **Abstract Syntax Tree (AST)** for backend processing.

### 3. Semantic Analysis
- **Function:** Maintains a Symbol Table to validate variable declarations and ensures that all `goto` statements point to valid, existing scenes. Prevents runtime crashes from undefined references.

### 4. Optimization
- **Dead Code Elimination:** Scans and removes unreachable scenes to save memory.
- **Peephole Optimization:** Merges consecutive print statements to streamline Virtual Machine execution.

### 5. Virtual Machine (Interpreter)
- **File:** `main.py`
- **Function:** Acts as the execution engine. It traverses the AST, manages the runtime environment (state and variables), and handles the interactive text-adventure terminal loop.

---

## 📂 Project Structure

| File | Purpose |
| :--- | :--- |
| `lexer.py` | Tokenization and Regex matching engine. |
| `parser.py` | CFG validation and AST generation. |
| `main.py` | The main entry point and Virtual Machine execution loop. |
| `game.adv` | A sample QuestScript source file containing game logic. |

---

## 🛠️ Installation & Usage

### Prerequisites
- Python 3.x installed on your system.

### Running the Compiler
To compile and run a QuestScript file, simply execute the `main.py` file and pass the `.adv` source file as an argument:

```
python main.py game.adv
```
📝 Sample QuestScript Code
Here is a quick look at the QuestScript syntax:

```
var has_key = false;

scene start {
    print("You wake up in a dark room.");
    choice "Search the floor" -> find_key;
    choice "Try the door" -> check_door;
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
👥 The Team
Syed Waleed Hussain - Frontend Lead (Lexical & Syntax Analysis / AST Generation)
Huzaifa - Logic Lead (Semantic Analysis & Optimization)
Sofia - Backend Lead (Virtual Machine & Execution Engine)
