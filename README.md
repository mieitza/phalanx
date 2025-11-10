<<<<<<< HEAD
# phalanx
=======
# Phalanx - Self-Hosted LLM Automation Platform

> An open-source, enterprise-ready automation platform that empowers developers to build and execute complex AI-driven workflows using self-hosted LLMs, with extensive tool execution capabilities including shell commands and Model Context Protocol (MCP) servers.

## 🌟 Key Features

- 🏠 **Self-Hosted LLM Support**: Run models locally (Ollama, vLLM, LocalAI) or on private infrastructure
- 🤖 **Advanced Automation**: Multi-step workflows with parallel tool execution and state management
- 🔧 **Binary Execution**: Direct shell command and binary execution with security controls
- 🔌 **MCP Integration**: Full Model Context Protocol support for extensible tool ecosystems
- 🎯 **Agent Orchestration**: Complex agent-to-agent communication and task delegation
- 🔒 **Enterprise Security**: Policy-based execution control, sandboxing, and audit trails

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ User Interfaces: CLI/TUI • Web UI • IDE Extensions          │
└─────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ API Gateway: AuthN (OIDC) • AuthZ (RBAC) • Rate Limiting    │
└─────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Core Services:                                              │
│  • LLM Gateway        • Tool Runner                         │
│  • Workflow Engine    • MCP Client Manager                  │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
phalanx/
├── apps/
│   ├── api-gateway/       # API Gateway with OIDC/RBAC
│   ├── llm-gateway/       # LLM provider abstraction
│   ├── workflow-engine/   # DAG workflow orchestration
│   ├── tool-runner/       # Tool execution with sandboxing
│   ├── mcp-manager/       # MCP server lifecycle management
│   ├── web/               # Web UI (Next.js)
│   └── cli/               # CLI/TUI interface
├── packages/
│   ├── shared/            # Shared utilities (logger, errors)
│   ├── schemas/           # Zod schemas and types
│   ├── sdk-js/            # TypeScript SDK
│   └── sdk-py/            # Python SDK
├── infra/
│   ├── compose/           # Docker Compose for local dev
│   ├── helm/              # Kubernetes Helm charts
│   └── migrations/        # Database migrations
├── examples/              # Example workflows and tools
└── e2e/                   # End-to-end tests
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose
- PostgreSQL 16+ (for production)

### Local Development Setup

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/phalanx.git
cd phalanx
```

2. **Install dependencies**

```bash
pnpm install
```

3. **Start local infrastructure**

```bash
docker compose -f infra/compose/dev.yml up -d
```

This starts:
- PostgreSQL (port 5432)
- Redis (port 6379)
- MinIO (port 9000, console 9001)
- Jaeger (UI port 16686)
- Ollama (port 11434)
- Prometheus (port 9090)
- Grafana (port 3000, admin/admin)

4. **Run database migrations**

```bash
pnpm run migrate
```

5. **Start development servers**

```bash
pnpm run dev
```

6. **Pull a local LLM model (optional)**

```bash
docker exec -it phalanx-ollama ollama pull llama3.1:8b
```

### Configuration

Create a configuration file at `~/.config/llm-automation/config.json`:

```json
{
  "providers": {
    "default": "ollama/llama3.1:8b",
    "aliases": {
      "fast": "ollama/llama3.1:8b",
      "powerful": "anthropic/claude-3.5"
    }
  },
  "sandbox": {
    "executor": "oci",
    "limits": {
      "cpu": 1,
      "mem": "1Gi",
      "timeoutSec": 120
    }
  }
}
```

## 📖 Documentation

- [Architecture Guide](./docs/architecture.md)
- [API Reference](./docs/api.md)
- [Configuration](./docs/configuration.md)
- [Security Model](./docs/security.md)
- [Development Guide](./docs/development.md)

## 🧪 Testing

```bash
# Run all tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run tests with coverage
pnpm run test -- --coverage

# Run linting
pnpm run lint

# Type check
pnpm run typecheck
```

## 🏗️ Building

```bash
# Build all packages
pnpm run build

# Build specific package
pnpm --filter @phalanx/api-gateway build
```

## 🐳 Docker

Build and run with Docker:

```bash
# Build all services
docker compose build

# Run production stack
docker compose up -d
```

## 📊 Monitoring

Access the following UIs when running locally:

- **Grafana**: http://localhost:3000 (admin/admin)
- **Jaeger**: http://localhost:16686
- **Prometheus**: http://localhost:9090
- **MinIO Console**: http://localhost:9001 (phalanx/phalanx123)

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `pnpm run test`
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 📋 Roadmap

### M1: Foundation (Weeks 1-4) - Current

- [x] Monorepo scaffolding
- [x] Shared packages (schemas, utilities)
- [ ] API Gateway with OIDC/RBAC
- [ ] LLM Gateway (OpenAI, Anthropic, Ollama)
- [ ] Tool Runner with shell execution
- [ ] Basic workflow engine

### M2: Tooling & MCP (Weeks 5-8)

- [ ] MCP client manager
- [ ] Policy engine for tool execution
- [ ] Multi-turn workflow support
- [ ] CLI/TUI interface

### M3: Enterprise (Weeks 9-12)

- [ ] Advanced security (sandboxing, audit logs)
- [ ] Cost accounting & quotas
- [ ] Web UI for workflow management
- [ ] GitHub App integration

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by Google's Gemini CLI architecture
- Built on the [Model Context Protocol](https://modelcontextprotocol.io/)
- Powered by open-source LLMs and tools

## 📧 Contact

- GitHub Issues: [https://github.com/yourusername/phalanx/issues](https://github.com/yourusername/phalanx/issues)
- Discord: [Join our community](https://discord.gg/phalanx)

---

Made with ❤️ by the Phalanx team
>>>>>>> 61ba0f0 (feat: initial project scaffolding for Phalanx platform)
