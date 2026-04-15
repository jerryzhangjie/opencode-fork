import { For, Show, createMemo, createSignal } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import type { Message } from "@opencode-ai/sdk/v2/client"
import type { Part } from "@opencode-ai/sdk/v2"
import { base64Encode } from "@opencode-ai/util/encode"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"

export type StepAgent = {
  name: string
  description?: string
  status: "pending" | "in_progress" | "completed"
  dispatchedAt?: string | null
  completedAt?: string | null
}

export type WorkflowStep = {
  id: string
  name: string
  mode?: string
  status: "pending" | "in_progress" | "completed"
  startedAt?: string | null
  completedAt?: string | null
  agents?: StepAgent[]
}

export type AgentInfo = {
  name: string
  status: "pending" | "in_progress" | "completed"
  description?: string
  dispatchedAt?: string | null
  completedAt?: string | null
}

export type TodoItem = {
  id?: string
  content: string
  status: "pending" | "in_progress" | "completed"
}

export type AgentFlowItem = {
  from: string
  to: string
  title?: string
  timestamp: string
}

export type AgentConfig = Record<
  string,
  {
    label?: string
    icon?: string
  }
>

export type TaskInfo = {
  id?: string
  name?: string
  status?: string
  statusLabel?: string
  heartbeat?: "active" | "stalled"
  heartbeatLabel?: string
}

export type AgentScheduleDetail = {
  task?: string
  requirement?: string
  currentState?: string
  currentStep?: string
  steps?: WorkflowStep[]
  agents?: AgentInfo[]
  todos?: TodoItem[]
  agentFlow?: AgentFlowItem[]
}

export type TaskProgressPanelProps = {
  selectedTask: () => TaskInfo | null
  scheduleDetail: () => AgentScheduleDetail
  agentConfig: () => AgentConfig
  childSessionIds?: () => any[]
  messages?: () => Message[]
  parts?: () => Part[]
  class?: string
}

const formatShortTime = (timeStr?: string) => {
  if (!timeStr) return "-"
  const date = new Date(timeStr)
  if (isNaN(date.getTime())) return timeStr
  return date.toLocaleTimeString("zh-CN", { hour12: false }).slice(0, 5)
}

const getAgentLabel = (key: string, config: AgentConfig) => {
  return config[key]?.label || key
}

const getAgentIcon = (key: string, config: AgentConfig) => {
  return config[key]?.icon || config["default"]?.icon || "🤖"
}

const getAgentStatusClass = (status: string) => {
  if (status === "completed") return "spf-completed"
  if (status === "in_progress") return "spf-active"
  return "spf-pending"
}

const getTodoStatusLabel = (status: string) => {
  const map: Record<string, string> = { completed: "完成", in_progress: "进行中", pending: "待办" }
  return map[status] || status
}

export function TaskProgressPanel(props: TaskProgressPanelProps) {
  const sync = useSync()
  const sdk = useSDK()
  const [selectedAgent, setSelectedAgent] = createSignal<string | null>(null)
  const [agentOutput, setAgentOutput] = createSignal<string>("")
  const [childSessionMessages, setChildSessionMessages] = createSignal<Message[]>([])
  const [childSessionParts, setChildSessionParts] = createSignal<Part[]>([])

  const allAgents = createMemo(() => {
    const detail = props.scheduleDetail()
    const steps = detail.steps || []

    const stepAgents = steps.flatMap((s) => s.agents || [])
    const directAgents = detail.agents || []
    const combined: AgentInfo[] = [...stepAgents, ...directAgents]

    const pmSteps = steps.filter((s) => s.mode === "primary" || s.mode === "user_gate")
    if (pmSteps.length > 0) {
      const targetStep =
        pmSteps.find((s) => s.status === "in_progress") || pmSteps.find((s) => s.status === "completed") || pmSteps[0]
      if (targetStep) {
        combined.unshift({
          name: "project-manager",
          status: targetStep.status,
          description: targetStep.name,
          dispatchedAt: targetStep.startedAt,
          completedAt: targetStep.completedAt,
        })
      }
    }

    const uniqueMap = new Map<string, AgentInfo>()
    for (const agent of combined) {
      if (!uniqueMap.has(agent.name)) {
        uniqueMap.set(agent.name, agent)
      }
    }
    return Array.from(uniqueMap.values())
  })

  const currentSelectedAgent = createMemo(() => {
    const name = selectedAgent()
    if (!name) return null
    return allAgents().find((a) => a.name === name) || null
  })

  const extractAgentOutput = (agentName: string) => {
    const messages = props.messages?.()
    if (!messages || messages.length === 0) return "暂无输出内容"

    const allParts = sync.data.part

    const assistantMessages = messages.filter((m) => m.role === "assistant")

    const taskToolParts: string[] = []
    for (const msg of assistantMessages) {
      const msgId = (msg as any).id
      const msgParts = allParts?.[msgId]
      if (!msgParts) continue
      for (const part of msgParts) {
        if (part.type === "tool" && (part as any).tool === "task") {
          const input = (part as any).input || {}
          if (input.subagent_type === agentName && input.description) {
            taskToolParts.push(input.description)
          }
        }
      }
    }

    if (taskToolParts.length > 0) {
      return taskToolParts.join("\n\n")
    }

    const filtered = assistantMessages.filter((m) => m.agent === agentName)

    if (filtered.length === 0) {
      if (agentName === "project-manager") {
        if (assistantMessages.length === 0) return "暂无输出内容"
        const lastMsg = assistantMessages[assistantMessages.length - 1]
        const msgId = (lastMsg as any).id
        const msgParts = sync.data.part?.[msgId]
        if (!msgParts || msgParts.length === 0) return "暂无输出内容"
        const textParts = msgParts.filter((p: any) => p.type === "text" && p.text?.trim())
        if (textParts.length === 0) return "暂无输出内容"
        return textParts.map((p: any) => p.text).join("\n")
      }
      return "暂无输出内容"
    }

    const texts: string[] = []
    for (const msg of filtered) {
      const msgId = (msg as any).id
      const msgParts = sync.data.part?.[msgId]
      if (!msgParts) continue
      for (const part of msgParts) {
        if (part.type === "text" && part.text?.trim()) {
          texts.push(part.text)
        }
      }
    }

    return texts.length > 0 ? texts.join("\n") : "暂无输出内容"
  }

  const findChildSessionForAgent = (agentName: string) => {
    const sessions = props.childSessionIds?.() || []
    const pattern = `@${agentName} subagent`
    return sessions.find((s) => s.title?.includes(pattern))
  }

  const fetchChildSessionMessages = async (childSession: { id: string; directory: string }) => {
    try {
      const client = sdk.client
      const result = await client.session.messages({
        sessionID: childSession.id,
        directory: childSession.directory,
        limit: 50,
      })
      if (result.data) {
        setChildSessionMessages(result.data as any[])
      }
    } catch (error) {
      console.error("获取子session消息失败:", error)
    }
  }

  const handleAgentClick = (agent: AgentInfo) => {
    const child = findChildSessionForAgent(agent.name)
    if (child) {
      setSelectedAgent(agent.name)
      fetchChildSessionMessages(child).then(() => {
        setAgentOutput(extractAgentOutputForChild(agent.name))
      })
      return
    }
    setSelectedAgent(agent.name)
    setAgentOutput(extractAgentOutput(agent.name))
  }

  const extractAgentOutputForChild = (agentName: string) => {
    const messages = childSessionMessages() as any[]
    if (!messages || messages.length === 0) return "暂无输出内容"

    const texts: string[] = []
    for (const item of messages) {
      const msg = item.info
      if (!msg || msg.role !== "assistant") continue
      const parts = item.parts || []
      for (const part of parts) {
        if (part.type === "text" && part.text?.trim()) {
          texts.push(part.text)
        }
      }
    }
    return texts.length > 0 ? texts.join("\n") : "暂无输出内容"
  }

  const handleShowAll = () => {
    setSelectedAgent(null)
    setAgentOutput("")
    setChildSessionMessages([])
  }

  const todosFromSteps = createMemo(() => {
    const steps = props.scheduleDetail().steps || []
    // 过滤掉空占位对象（id 或 name 为空则视为无效数据）
    return steps
      .filter((step) => step.id && step.name)
      .map((step) => ({
        id: step.id,
        content: step.name,
        status: step.status as "pending" | "in_progress" | "completed",
      }))
  })
  const filteredAgentFlow = createMemo(() => {
    const flows = props.scheduleDetail().agentFlow || []
    // 过滤掉 from/to 为空或纯空格的无效记录
    return flows.filter((flow) => flow.from?.trim() && flow.to?.trim() && flow.timestamp)
  })

  const todoPercent = createMemo(() => {
    const todos = todosFromSteps()
    if (todos.length === 0) return 0
    const completed = todos.filter((t) => t.status === "completed").length
    return Math.round((completed / todos.length) * 100)
  })

  const todoCompletedCount = createMemo(() => {
    const todos = todosFromSteps()
    return todos.filter((t) => t.status === "completed").length
  })

  return (
    <div class={`sd-panel sd-progress ${props.class || ""}`}>
      <div class="sd-progress-header">
        <span>📊 任务进展</span>
        <Show when={props.selectedTask()?.heartbeat}>
          <span class={`hb ${props.selectedTask()?.heartbeat}`}>{props.selectedTask()?.heartbeatLabel}</span>
        </Show>
      </div>
      <div class="sd-progress-list">
        <Show
          when={props.selectedTask() && props.scheduleDetail().steps?.length}
          fallback={<div class="sp-empty">暂无任务进展</div>}
        >
          <div class="sp-detail">
            {/* <div class="spd-header">
              <span class="spd-id">{props.selectedTask()?.id}</span>
              <span class={`tag st-${props.selectedTask()?.status}`}>{props.selectedTask()?.statusLabel}</span>
            </div> */}
            <h3 class="spd-title">{props.scheduleDetail().task}</h3>

            <Show when={allAgents().length}>
              <div class="spd-section">
                <div class="spdt-header">
                  <span class="spdt-header-left">
                    执行阶段
                    <span
                      class={`spdt-header-link ${selectedAgent() === null ? "active" : ""}`}
                      onClick={handleShowAll}
                    >
                      全部进程
                      <Show when={selectedAgent() === null}>
                        <span class="spdt-active-dot" />
                      </Show>
                    </span>
                  </span>
                </div>
                <div class="spd-agents-flow-wrapper">
                  <div class="spd-agents-flow">
                    <For each={allAgents()}>
                      {(agent) => (
                        <div
                          class={`spf-item ${getAgentStatusClass(agent.status)} ${selectedAgent() === agent.name ? "selected" : ""}`}
                          title={getAgentLabel(agent.name, props.agentConfig())}
                          onClick={() => handleAgentClick(agent)}
                          style={{ cursor: "pointer" }}
                        >
                          <div class="spf-icon-wrapper">
                            <span class="spf-icon">{getAgentIcon(agent.name, props.agentConfig())}</span>
                          </div>
                          <div class="spf-name">{getAgentLabel(agent.name, props.agentConfig())}</div>
                          <span class={`spf-status-dot ${agent.status}`} />
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </div>
            </Show>

            <Show when={selectedAgent() !== null && currentSelectedAgent()}>
              <div class="spd-section">
                <div class="spdt-header">
                  <span>{getAgentLabel(currentSelectedAgent()!.name, props.agentConfig())} 输出</span>
                </div>
                <div class="spd-agent-output">
                  <pre class="spd-output-content">{agentOutput()}</pre>
                </div>
              </div>
            </Show>

            <Show when={selectedAgent() === null && todosFromSteps().length}>
              <div class="spd-section">
                <div class="spdt-header">
                  <span>
                    待办事项
                    <span>
                      ({todoCompletedCount()}/{todosFromSteps().length})
                    </span>
                  </span>
                  <span class="spdt-percent">{todoPercent()}%</span>
                </div>
                <div class="spdt-bar-container">
                  <div class="spdt-bar">
                    <div class="spdt-fill" style={{ width: `${todoPercent()}%` }} />
                  </div>
                </div>
                <div class="spdt-list">
                  <For each={todosFromSteps()}>
                    {(todo) => {
                      const stepAgents = createMemo(() => {
                        const steps = props.scheduleDetail().steps || []
                        const step = steps.find((s) => s.id === todo.id)
                        return step?.agents || []
                      })
                      const activeAgent = createMemo(() => stepAgents().find((a) => a.status === "in_progress"))
                      const isInProgress = todo.status === "in_progress"
                      const [expanded, setExpanded] = createSignal(isInProgress)

                      return (
                        <div class={`spdt-item ${todo.status === "completed" ? "done" : ""}`}>
                          <div class="spdti-main" onClick={() => isInProgress && setExpanded(!expanded())}>
                            <span class="spdti-icon">
                              {todo.status === "completed" ? "✅" : todo.status === "in_progress" ? "⏳" : "⚪"}
                            </span>
                            <span class="spdti-title">{todo.content}</span>
                            <span class={`spdti-status tag st-${todo.status}`}>{getTodoStatusLabel(todo.status)}</span>
                          </div>
                          <Show when={isInProgress && expanded() && activeAgent()}>
                            <div class="spdti-collapse">
                              <div class="spdti-collapse-content">
                                <div class="spcd-row">
                                  <span class="spcd-label">🚀 当前执行：</span>
                                  <span class="spcd-value">{activeAgent()?.description || "-"}</span>
                                </div>
                                <div class="spcd-row">
                                  <span class="spcd-label">开始时间：</span>
                                  <span class="spcd-value">
                                    {activeAgent()?.dispatchedAt ? (activeAgent()?.dispatchedAt ?? null) : "-"}
                                  </span>
                                </div>
                                <div class="spcd-row">
                                  <span class="spcd-label">完成时间：</span>
                                  <span class="spcd-value">
                                    {activeAgent()?.completedAt ? (activeAgent()?.completedAt ?? null) : "-"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </Show>
                        </div>
                      )
                    }}
                  </For>
                </div>
              </div>
            </Show>

            <Show when={selectedAgent() === null && filteredAgentFlow().length}>
              <div class="spd-section">
                <div class="spdt-header">流转日志</div>
                <div class="spd-flow-list-centered">
                  <For each={filteredAgentFlow()}>
                    {(flow) => (
                      <div class="spdtr-item-centered">
                        <span class="spdtr-time">{formatShortTime(flow.timestamp)}</span>
                        <span class="spdtr-from">{getAgentLabel(flow.from, props.agentConfig())}</span>
                        <Icon name="arrow-right" class="spdtr-arrow" />
                        <span class="spdtr-to">{getAgentLabel(flow.to, props.agentConfig())}</span>
                        <span class="spdtr-title">{flow.title}</span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  )
}
