# Phalanx - Self-Hosted LLM Automation Platform

> An open-source, enterprise-ready automation platform that empowers developers to build and execute complex AI-driven workflows using self-hosted LLMs, with extensive tool execution capabilities including shell commands and Model Context Protocol (MCP) servers.

## 🌟 Key Features

- 🏠 **Self-Hosted LLM Support**: Run models locally (Ollama, vLLM, LocalAI) or on private infrastructure
- 🤖 **Advanced Automation**: Multi-step workflows with parallel tool execution and state management
- 🔧 **Binary Execution**: Direct shell command and binary execution with security controls
- 🔌 **MCP Integration**: Full Model Context Protocol support for extensible tool ecosystems
- 🎯 **Agent Orchestration**: Complex agent-to-agent communication and task delegation
- 🔒 **Enterprise Security**: Policy-based execution control, sandboxing, and audit trails
- 💾 **Zero External Dependencies**: SQLite database - no PostgreSQL required!

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
│  • LLM Gateway (OpenAI, Anthropic, Ollama)                 │
│  • Tool Runner (Shell + Docker Sandbox)                     │
│  • Workflow Engine (Coming Soon)                            │
│  • MCP Manager (Coming Soon)                                │
└─────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Data Layer:                                                 │
│  • SQLite (single file - ./data/phalanx.db)                │
│  • Optional Redis (caching)                                 │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
phalanx/
├── apps/
│   ├── api-gateway/       # ✅ API Gateway with OIDC/RBAC
│   ├── llm-gateway/       # ✅ LLM provider abstraction
│   ├── tool-runner/       # ✅ Tool execution with sandboxing
│   ├── workflow-engine/   # 🚧 DAG workflow orchestration
│   ├── mcp-manager/       # 🚧 MCP server lifecycle management
│   ├── web/               # 🚧 Web UI (Next.js)
│   └── cli/               # 🚧 CLI/TUI interface
├── packages/
│   ├── shared/            # ✅ Shared utilities (logger, errors)
│   ├── schemas/           # ✅ Zod schemas and types
│   ├── database/          # ✅ Drizzle ORM + SQLite
│   ├── sdk-js/            # 🚧 TypeScript SDK
│   └── sdk-py/            # 🚧 Python SDK
├── infra/
│   ├── compose/           # Docker Compose for local dev
│   └── helm/              # Kubernetes Helm charts
├── data/                  # SQLite database (gitignored)
├── examples/              # Example workflows and tools
└── e2e/                   # End-to-end tests
```

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+**
- **pnpm 8+**
- **Docker** (optional - only for sandboxed execution and observability tools)

**That's it!** No PostgreSQL, no complex database setup. Just install and run!

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

3. **Generate and run database migrations**

```bash
# Generate migration files
pnpm --filter @phalanx/database db:generate

# Run migrations
pnpm --filter @phalanx/database db:migrate
```

4. **(Optional) Start infrastructure services**

Only needed for observability and optional Redis caching:

```bash
docker compose -f infra/compose/dev.yml up -d
```

This starts:
- Redis (port 6379) - Optional caching
- MinIO (port 9000, console 9001) - Object storage
- Jaeger (UI port 16686) - Distributed tracing
- Ollama (port 11434) - Local LLM runtime
- Prometheus (port 9090) - Metrics
- Grafana (port 3000, admin/admin) - Dashboards

5. **Start development servers**

```bash
# Start all services
pnpm run dev

# Or start individual services
pnpm --filter @phalanx/api-gateway dev    # Port 3001
pnpm --filter @phalanx/llm-gateway dev    # Port 3002
pnpm --filter @phalanx/tool-runner dev    # Port 3003
```

6. **Pull a local LLM model (optional)**

```bash
docker exec -it phalanx-ollama ollama pull llama3.1:8b
```

### Configuration

Create `.env` from the example:

```bash
cp .env.example .env
```

Key settings:

```env
# Database (SQLite - single file, no server!)
DATABASE_URL=./data/phalanx.db

# LLM Providers
OPENAI_API_KEY=sk-...         # Optional
ANTHROPIC_API_KEY=sk-ant-...  # Optional
OLLAMA_BASE_URL=http://localhost:11434  # Local models

# Sandbox
SANDBOX_EXECUTOR=docker       # or "shell" for no isolation
```

## 💾 Database: Why SQLite?

We chose **SQLite + Drizzle ORM** for ultimate simplicity:

✅ **Zero Setup** - No external database server required
✅ **Single File** - `./data/phalanx.db` - Easy backups
✅ **Fast** - Often faster than PostgreSQL for single-machine workloads
✅ **ACID Compliant** - Full transactional support
✅ **Production Ready** - Used by millions of applications
✅ **Easy Migration** - Can upgrade to PostgreSQL when needed

Perfect for the self-hosted philosophy!

### Database Operations

```bash
# Generate migrations after schema changes
pnpm --filter @phalanx/database db:generate

# Run migrations
pnpm --filter @phalanx/database db:migrate

# Open Drizzle Studio (visual DB explorer)
pnpm --filter @phalanx/database db:studio

# Push schema directly (dev only)
pnpm --filter @phalanx/database db:push
```

## 📖 API Documentation

### LLM Gateway (Port 3002)

```bash
# Non-streaming completion
curl -X POST http://localhost:3002/api/v1/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ollama/llama3.1:8b",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Streaming completion (SSE)
curl -X POST http://localhost:3002/api/v1/stream \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "Count to 10"}]
  }'

# List available models
curl http://localhost:3002/api/v1/models
```

### Tool Runner (Port 3003)

```bash
# Execute shell command
curl -X POST http://localhost:3003/api/v1/exec \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "shell",
    "args": {"cmd": "echo Hello World"}
  }'

# Stream execution output
curl http://localhost:3003/api/v1/exec/{execId}/stream

# List policy rules
curl http://localhost:3003/api/v1/policy/rules
```

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

## 📊 Monitoring

Access the following UIs when running locally:

- **Grafana**: http://localhost:3000 (admin/admin)
- **Jaeger**: http://localhost:16686
- **Prometheus**: http://localhost:9090
- **MinIO Console**: http://localhost:9001 (phalanx/phalanx123)
- **Drizzle Studio**: Run `pnpm --filter @phalanx/database db:studio`

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

### M1: Foundation (Weeks 1-4) - ✅ 95% Complete

- [x] Monorepo scaffolding
- [x] Shared packages (schemas, utilities, database)
- [x] API Gateway with OIDC/RBAC
- [x] LLM Gateway (OpenAI, Anthropic, Ollama)
- [x] Tool Runner with shell + Docker execution
- [x] SQLite + Drizzle ORM data persistence
- [x] Policy engine for secure execution
- [ ] Basic workflow engine

### M2: Workflow & MCP (Weeks 5-8)

- [ ] Workflow engine with DAG execution
- [ ] MCP client manager
- [ ] Multi-turn workflow support
- [ ] CLI/TUI interface
- [ ] Human-in-the-loop approvals

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
