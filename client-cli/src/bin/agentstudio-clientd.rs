use anyhow::Result;

fn main() -> Result<()> {
    env_logger::init();
    agentstudio_client_native::backend_core::run_daemon_forever()
}
