# Sprig - A Language Sprouting From NodeJS

Sprig is a dynamic programming language built on NodeJS that allows developers to write efficient and powerful code. It leverages the capabilities of NodeJS while providing its own syntax and structure.

## Key Features

- **Bi-Directional Data Flow**: Sprig enables seamless data exchange between NodeJS and the Sprig environment, making it easy to utilize existing NodeJS libraries and functions within your Sprig code.

- **Extensibility**: The language is designed for easy extension, allowing developers to create custom modules and functions tailored to their specific needs.

- **Integration with NodeJS**: Sprig takes advantage of NodeJS’s non-blocking I/O and asynchronous programming model, providing a robust framework for building scalable applications.

## Getting Started

1. **Installation**: Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/dibsonthis/sprig.git
   cd sprig
   npm install
   ```

2. **Build the executable**: Use the following command to build the sprig executable - this compiles and packages sprig into the bin folder:

   ```bash
   npm run package (or package:win for Windows)
   ```

3. **Install the executable**: To install sprig globally, use the following script:
   ```bash
   npm run bin (or bin:win for Windows)
   ```

### Your first Sprig program

```python
const sayHi = () => print("Hello from Sprig 🌿")
sayHi()
```
