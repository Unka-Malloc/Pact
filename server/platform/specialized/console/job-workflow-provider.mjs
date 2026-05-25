export const JOB_WORKFLOW_PROVIDER_PROTOCOL_VERSION = "pact.job-workflow.v1";

function requireJobManager(jobManager = null) {
  const required = [
    "createJob",
    "getJob",
    "getJobByCheckpointId",
    "getJobResult",
    "listJobs",
    "reparseJob"
  ];
  const missing = required.filter((name) => typeof jobManager?.[name] !== "function");
  if (missing.length > 0) {
    throw new Error(`job workflow provider is not connected to jobManager: ${missing.join(", ")}`);
  }
  return jobManager;
}

export function createJobWorkflowProvider({ jobManager } = {}) {
  const manager = requireJobManager(jobManager);
  return Object.freeze({
    protocolVersion: JOB_WORKFLOW_PROVIDER_PROTOCOL_VERSION,
    describe() {
      return {
        schemaVersion: 1,
        protocolVersion: JOB_WORKFLOW_PROVIDER_PROTOCOL_VERSION,
        capabilities: [
          "jobs.create",
          "jobs.list",
          "jobs.get",
          "jobs.result",
          "jobs.reparse",
          "jobs.checkpoint.lookup"
        ]
      };
    },
    createJob(input = {}) {
      return manager.createJob(input);
    },
    getJob(jobId = "") {
      return manager.getJob(jobId);
    },
    getJobByCheckpointId(checkpointId = "") {
      return manager.getJobByCheckpointId(checkpointId);
    },
    getJobResult(jobId = "") {
      return manager.getJobResult(jobId);
    },
    listJobs(input = {}) {
      return manager.listJobs(input);
    },
    reparseJob(jobId = "", input = {}) {
      return manager.reparseJob(jobId, input);
    }
  });
}
