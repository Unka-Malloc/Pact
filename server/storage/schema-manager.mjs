import path from "node:path";

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function getDatabaseDirectory(userDataPath) {
  return path.join(userDataPath, "metadata");
}

export function getMetadataDatabasePath(userDataPath) {
  return path.join(getDatabaseDirectory(userDataPath), "splitall.sqlite");
}

export function initializeMetadataSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS import_batches (
      batch_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      settings_json TEXT NOT NULL DEFAULT '{}',
      warnings_json TEXT NOT NULL DEFAULT '[]',
      overview_json TEXT NOT NULL DEFAULT '{}',
      source_count INTEGER NOT NULL DEFAULT 0,
      raw_object_count INTEGER NOT NULL DEFAULT 0,
      email_count INTEGER NOT NULL DEFAULT 0,
      thread_count INTEGER NOT NULL DEFAULT 0,
      transaction_count INTEGER NOT NULL DEFAULT 0,
      people_count INTEGER NOT NULL DEFAULT 0,
      retrieval_count INTEGER NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS raw_mail_objects (
      object_id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      ingest_origin TEXT NOT NULL,
      original_file_name TEXT NOT NULL,
      original_relative_path TEXT NOT NULL,
      original_source_path TEXT NOT NULL,
      source_container_path TEXT NOT NULL,
      storage_rel_path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      source_created_at TEXT NOT NULL DEFAULT '',
      source_updated_at TEXT NOT NULL DEFAULT '',
      source_collected_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE(batch_id, source_ref)
    );

    CREATE TABLE IF NOT EXISTS source_files (
      record_id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      name TEXT NOT NULL,
      source_path TEXT NOT NULL,
      kind TEXT NOT NULL,
      raw_object_id TEXT,
      source_created_at TEXT NOT NULL DEFAULT '',
      source_updated_at TEXT NOT NULL DEFAULT '',
      source_collected_at TEXT NOT NULL DEFAULT '',
      media_type TEXT NOT NULL DEFAULT '',
      extracted_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE(batch_id, source_ref)
    );

    CREATE TABLE IF NOT EXISTS people (
      record_id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      name TEXT NOT NULL,
      primary_email TEXT NOT NULL,
      aliases_json TEXT NOT NULL DEFAULT '[]',
      organization TEXT NOT NULL,
      primary_department TEXT NOT NULL,
      departments_json TEXT NOT NULL DEFAULT '[]',
      relation TEXT NOT NULL,
      role TEXT NOT NULL,
      sent_count INTEGER NOT NULL DEFAULT 0,
      received_count INTEGER NOT NULL DEFAULT 0,
      cc_count INTEGER NOT NULL DEFAULT 0,
      bcc_count INTEGER NOT NULL DEFAULT 0,
      transaction_count INTEGER NOT NULL DEFAULT 0,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      top_topics_json TEXT NOT NULL DEFAULT '[]',
      top_counterparties_json TEXT NOT NULL DEFAULT '[]',
      summary TEXT NOT NULL,
      time_weight REAL NOT NULL,
      freshness TEXT NOT NULL,
      formal_use_allowed INTEGER NOT NULL,
      UNIQUE(batch_id, person_id)
    );

    CREATE TABLE IF NOT EXISTS email_messages (
      record_id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      raw_object_id TEXT,
      subject TEXT NOT NULL,
      normalized_subject TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      body TEXT NOT NULL,
      keywords_json TEXT NOT NULL DEFAULT '[]',
      chunk_ids_json TEXT NOT NULL DEFAULT '[]',
      message_id_header TEXT NOT NULL DEFAULT '',
      in_reply_to TEXT NOT NULL DEFAULT '',
      references_json TEXT NOT NULL DEFAULT '[]',
      previous_message_ids_json TEXT NOT NULL DEFAULT '[]',
      conversation_key TEXT NOT NULL DEFAULT '',
      thread_id TEXT NOT NULL DEFAULT '',
      transaction_id TEXT NOT NULL DEFAULT '',
      participant_ids_json TEXT NOT NULL DEFAULT '[]',
      time_weight REAL NOT NULL,
      freshness TEXT NOT NULL,
      status TEXT NOT NULL,
      formal_use_allowed INTEGER NOT NULL,
      UNIQUE(batch_id, message_id)
    );

    CREATE TABLE IF NOT EXISTS email_message_participants (
      batch_id TEXT NOT NULL,
      message_record_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      role TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (message_record_id, role, position)
    );

    CREATE TABLE IF NOT EXISTS email_threads (
      record_id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      normalized_subject TEXT NOT NULL,
      summary TEXT NOT NULL,
      message_ids_json TEXT NOT NULL DEFAULT '[]',
      participant_ids_json TEXT NOT NULL DEFAULT '[]',
      sender_ids_json TEXT NOT NULL DEFAULT '[]',
      started_at TEXT NOT NULL,
      latest_activity_at TEXT NOT NULL,
      keywords_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL,
      cadence TEXT NOT NULL,
      categories_json TEXT NOT NULL DEFAULT '[]',
      pending_signals_json TEXT NOT NULL DEFAULT '[]',
      transaction_id TEXT NOT NULL DEFAULT '',
      time_weight REAL NOT NULL,
      freshness TEXT NOT NULL,
      formal_use_allowed INTEGER NOT NULL,
      UNIQUE(batch_id, thread_id)
    );

    CREATE TABLE IF NOT EXISTS email_thread_messages (
      batch_id TEXT NOT NULL,
      thread_record_id TEXT NOT NULL,
      message_record_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (thread_record_id, position)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      record_id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      title TEXT NOT NULL,
      normalized_subject TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      latest_activity_at TEXT NOT NULL,
      thread_ids_json TEXT NOT NULL DEFAULT '[]',
      message_ids_json TEXT NOT NULL DEFAULT '[]',
      participant_ids_json TEXT NOT NULL DEFAULT '[]',
      timeline_event_ids_json TEXT NOT NULL DEFAULT '[]',
      keywords_json TEXT NOT NULL DEFAULT '[]',
      decisions_json TEXT NOT NULL DEFAULT '[]',
      pending_items_json TEXT NOT NULL DEFAULT '[]',
      cadence TEXT NOT NULL,
      categories_json TEXT NOT NULL DEFAULT '[]',
      source_departments_json TEXT NOT NULL DEFAULT '[]',
      lineage_id TEXT NOT NULL DEFAULT '',
      lifecycle_stage TEXT NOT NULL DEFAULT '',
      lifecycle_previous_state TEXT NOT NULL DEFAULT '',
      lifecycle_next_state TEXT NOT NULL DEFAULT '',
      lifecycle_match_score REAL NOT NULL DEFAULT 0,
      lifecycle_match_reasons_json TEXT NOT NULL DEFAULT '[]',
      lifecycle_matched_batch_id TEXT NOT NULL DEFAULT '',
      lifecycle_matched_transaction_id TEXT NOT NULL DEFAULT '',
      lifecycle_pulled_event_count INTEGER NOT NULL DEFAULT 0,
      lifecycle_pulled_batch_count INTEGER NOT NULL DEFAULT 0,
      lifecycle_pulled_transaction_count INTEGER NOT NULL DEFAULT 0,
      source_spread INTEGER NOT NULL DEFAULT 0,
      time_weight REAL NOT NULL,
      freshness TEXT NOT NULL,
      formal_use_allowed INTEGER NOT NULL,
      UNIQUE(batch_id, transaction_id)
    );

    CREATE TABLE IF NOT EXISTS transaction_threads (
      batch_id TEXT NOT NULL,
      transaction_record_id TEXT NOT NULL,
      thread_record_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (transaction_record_id, position)
    );

    CREATE TABLE IF NOT EXISTS timeline_events (
      record_id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      timeline_event_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      message_id TEXT NOT NULL DEFAULT '',
      thread_id TEXT NOT NULL DEFAULT '',
      transaction_id TEXT NOT NULL DEFAULT '',
      lineage_id TEXT NOT NULL DEFAULT '',
      timeline_phase TEXT NOT NULL DEFAULT 'current',
      origin_batch_id TEXT NOT NULL DEFAULT '',
      origin_transaction_id TEXT NOT NULL DEFAULT '',
      participant_ids_json TEXT NOT NULL DEFAULT '[]',
      time_weight REAL NOT NULL,
      freshness TEXT NOT NULL,
      UNIQUE(batch_id, timeline_event_id)
    );

    CREATE TABLE IF NOT EXISTS transaction_lineages (
      lineage_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      normalized_subject TEXT NOT NULL DEFAULT '',
      cadence TEXT NOT NULL DEFAULT 'unknown',
      categories_json TEXT NOT NULL DEFAULT '[]',
      keywords_json TEXT NOT NULL DEFAULT '[]',
      participant_ids_json TEXT NOT NULL DEFAULT '[]',
      source_departments_json TEXT NOT NULL DEFAULT '[]',
      lifecycle_state TEXT NOT NULL DEFAULT 'active',
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      last_batch_id TEXT NOT NULL DEFAULT '',
      last_transaction_id TEXT NOT NULL DEFAULT '',
      last_transaction_record_id TEXT NOT NULL DEFAULT '',
      occurrence_count INTEGER NOT NULL DEFAULT 0,
      batch_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transaction_lineage_runs (
      record_id TEXT PRIMARY KEY,
      lineage_id TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      local_transaction_id TEXT NOT NULL,
      local_transaction_record_id TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'new',
      previous_state TEXT NOT NULL DEFAULT '',
      next_state TEXT NOT NULL DEFAULT '',
      match_score REAL NOT NULL DEFAULT 0,
      match_reasons_json TEXT NOT NULL DEFAULT '[]',
      pulled_event_count INTEGER NOT NULL DEFAULT 0,
      pulled_batch_count INTEGER NOT NULL DEFAULT 0,
      pulled_transaction_count INTEGER NOT NULL DEFAULT 0,
      matched_batch_id TEXT NOT NULL DEFAULT '',
      matched_transaction_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE(batch_id, local_transaction_id)
    );

    CREATE TABLE IF NOT EXISTS client_registrations (
      client_id TEXT PRIMARY KEY,
      client_label TEXT NOT NULL DEFAULT '',
      app_version TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT '',
      hostname TEXT NOT NULL DEFAULT '',
      bootstrap_url TEXT NOT NULL DEFAULT '',
      current_service_url TEXT NOT NULL DEFAULT '',
      desired_service_url TEXT NOT NULL DEFAULT '',
      current_job_service_url TEXT NOT NULL DEFAULT '',
      config_version TEXT NOT NULL DEFAULT '',
      migration_state TEXT NOT NULL DEFAULT 'unknown',
      last_error TEXT NOT NULL DEFAULT '',
      busy INTEGER NOT NULL DEFAULT 0,
      last_job_id TEXT NOT NULL DEFAULT '',
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      last_seen_server_id TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS retrieval_documents (
      record_id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      retrieval_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      snippet TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      source TEXT NOT NULL,
      keywords_json TEXT NOT NULL DEFAULT '[]',
      participant_ids_json TEXT NOT NULL DEFAULT '[]',
      transaction_id TEXT NOT NULL DEFAULT '',
      thread_id TEXT NOT NULL DEFAULT '',
      raw_object_id TEXT NOT NULL DEFAULT '',
      time_weight REAL NOT NULL,
      freshness TEXT NOT NULL,
      status TEXT NOT NULL,
      formal_use_allowed INTEGER NOT NULL,
      review_due_at TEXT NOT NULL DEFAULT '',
      search_terms_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      UNIQUE(batch_id, retrieval_id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS retrieval_fts USING fts5(
      record_id UNINDEXED,
      title,
      search_text,
      source,
      keywords,
      tokenize = 'unicode61 remove_diacritics 0'
    );

    CREATE TABLE IF NOT EXISTS knowledge_items (
      item_id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      item_type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      revision INTEGER NOT NULL DEFAULT 1,
      server_updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      categories_json TEXT NOT NULL DEFAULT '[]',
      entity_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      chunk_id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      snippet TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      timestamp TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      server_updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_evidence (
      evidence_id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      source_kind TEXT NOT NULL DEFAULT '',
      source_id TEXT NOT NULL DEFAULT '',
      job_id TEXT NOT NULL DEFAULT '',
      document_id TEXT NOT NULL DEFAULT '',
      chunk_id TEXT NOT NULL DEFAULT '',
      snippet TEXT NOT NULL DEFAULT '',
      locator_json TEXT NOT NULL DEFAULT '{}',
      server_updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_graph_nodes (
      node_id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL DEFAULT '',
      batch_id TEXT NOT NULL,
      node_type TEXT NOT NULL,
      label TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      weight REAL NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      server_updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_graph_edges (
      edge_id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      weight REAL NOT NULL DEFAULT 0,
      evidence_ids_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      server_updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_change_log (
      cursor INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'upsert',
      entity_id TEXT NOT NULL DEFAULT '',
      item_id TEXT NOT NULL DEFAULT '',
      batch_id TEXT NOT NULL DEFAULT '',
      revision INTEGER NOT NULL DEFAULT 0,
      server_updated_at TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS knowledge_client_changes (
      operation_id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT '',
      base_revision INTEGER NOT NULL DEFAULT 0,
      field_patch_json TEXT NOT NULL DEFAULT '{}',
      client_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT '',
      response_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS knowledge_review_items (
      review_id TEXT PRIMARY KEY,
      operation_id TEXT NOT NULL DEFAULT '',
      entity_id TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      base_revision INTEGER NOT NULL DEFAULT 0,
      current_revision INTEGER NOT NULL DEFAULT 0,
      client_id TEXT NOT NULL DEFAULT '',
      field_patch_json TEXT NOT NULL DEFAULT '{}',
      server_record_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT NOT NULL DEFAULT '',
      resolution_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS batch_deletion_operations (
      operation_id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL UNIQUE,
      job_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      state_json TEXT NOT NULL DEFAULT '{}',
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_batches_status ON import_batches(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_raw_mail_batch ON raw_mail_objects(batch_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sources_batch_kind ON source_files(batch_id, kind);
    CREATE INDEX IF NOT EXISTS idx_messages_batch_sent ON email_messages(batch_id, sent_at DESC);
    CREATE INDEX IF NOT EXISTS idx_threads_batch_activity ON email_threads(batch_id, latest_activity_at DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_batch_activity ON transactions(batch_id, latest_activity_at DESC);
    CREATE INDEX IF NOT EXISTS idx_people_batch_seen ON people(batch_id, last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_timeline_batch_timestamp ON timeline_events(batch_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_timeline_lineage_timestamp ON timeline_events(lineage_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_retrieval_batch_timestamp ON retrieval_documents(batch_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_retrieval_formal ON retrieval_documents(formal_use_allowed, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_knowledge_items_type_updated ON knowledge_items(item_type, server_updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_knowledge_items_batch ON knowledge_items(batch_id, item_type);
    CREATE INDEX IF NOT EXISTS idx_knowledge_items_entity ON knowledge_items(item_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_item ON knowledge_chunks(item_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_knowledge_evidence_item ON knowledge_evidence(item_id, server_updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_knowledge_graph_edges_source ON knowledge_graph_edges(source_id, weight DESC);
    CREATE INDEX IF NOT EXISTS idx_knowledge_graph_edges_target ON knowledge_graph_edges(target_id, weight DESC);
    CREATE INDEX IF NOT EXISTS idx_knowledge_change_cursor ON knowledge_change_log(cursor);
    CREATE INDEX IF NOT EXISTS idx_knowledge_review_status ON knowledge_review_items(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lineages_state_seen ON transaction_lineages(lifecycle_state, last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lineages_subject ON transaction_lineages(normalized_subject, last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lineages_subject_ci ON transaction_lineages(lower(normalized_subject), last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lineage_runs_lineage ON transaction_lineage_runs(lineage_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lineage_runs_batch ON transaction_lineage_runs(batch_id, local_transaction_id);
    CREATE INDEX IF NOT EXISTS idx_clients_seen ON client_registrations(last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_clients_state ON client_registrations(migration_state, last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_batch_deletions_status ON batch_deletion_operations(status, updated_at DESC);
  `);

  ensureColumn(db, "transactions", "normalized_subject", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "transactions", "lineage_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "transactions", "lifecycle_stage", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "transactions", "lifecycle_previous_state", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "transactions", "lifecycle_next_state", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "transactions", "lifecycle_match_score", "REAL NOT NULL DEFAULT 0");
  ensureColumn(db, "transactions", "lifecycle_match_reasons_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "transactions", "lifecycle_matched_batch_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "transactions", "lifecycle_matched_transaction_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "transactions", "lifecycle_pulled_event_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "transactions", "lifecycle_pulled_batch_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "transactions", "lifecycle_pulled_transaction_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "timeline_events", "lineage_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "timeline_events", "timeline_phase", "TEXT NOT NULL DEFAULT 'current'");
  ensureColumn(db, "timeline_events", "origin_batch_id", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "timeline_events", "origin_transaction_id", "TEXT NOT NULL DEFAULT ''");
}
