# Libris_r1

A production-ready Books REST API with an automated CI/CD pipeline.

## Project Structure

- `books-api/`: The main application source code, tests, and Docker configuration.
- `SPECs.md`: Detailed project specifications and build instructions.

## Quick Start

To run the API locally using Docker:

```bash
cd books-api
docker build -t books-api .
docker run -p 3000:3000 books-api
```

For more detailed information, please see the [books-api/README.md](./books-api/README.md).
