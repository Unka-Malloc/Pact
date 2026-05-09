export async function createAgentWorkerRuntime() {
  return {
    mode: "standby",
    async tick() {
      return {
        status: "standby",
        details: {
          mode: "supervised_process_ready",
          note: "该后台角色已由守护进程托管；执行队列将在后续迁移到该进程。"
        }
      };
    },
    async close() {}
  };
}
