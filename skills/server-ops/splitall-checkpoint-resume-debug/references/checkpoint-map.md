# Checkpoint And Resume Map

Server side:

- `new/server/uploads/upload-session-store.mjs`
- `new/server/interfaces/http/controllers/jobs-controller.mjs`
- `new/server/jobs/job-manager.mjs`

Client side:

- `new/flutter_client/lib/src/services/runtime_services.dart`
- `new/flutter_client/test/checkpoint_store_test.dart`

Debug sequence:

1. Read local `checkpoints.json`.
2. `GET /api/upload-sessions/:sessionId`.
3. Compare `receivedBytes`, `byteSize`, and `sha256`.
4. On `offset_mismatch`, resume from server `expectedOffset`.
5. Do not reuse a checkpoint id for a different manifest digest.
6. After job creation, poll `GET /api/jobs/:id`.

The server deletes a completed upload session after the owning job finalizes.
