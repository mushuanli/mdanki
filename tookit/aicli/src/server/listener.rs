// src/server/listener.rs

use crate::server::db::Database;
use crate::server::handler;
use crate::server::worker::AiTask;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::mpsc;

pub async fn run(db: Arc<Database>, tx: mpsc::Sender<AiTask>) -> crate::error::Result<()> {
    let listener = TcpListener::bind("0.0.0.0:9501").await?;
    log::info!("Server listening on 0.0.0.0:9501");

    loop {
        let (stream, addr) = listener.accept().await?;
        log::info!("Accepted connection from: {}", addr);

        let db_clone = db.clone();
        let tx_clone = tx.clone();

        tokio::spawn(async move {
            if let Err(e) = handler::handle_connection(stream, addr, db_clone, tx_clone).await {
                log::error!("Error handling connection from {}: {}", addr, e);
            }
        });
    }
}
