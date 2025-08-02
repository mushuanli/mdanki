// src/client/tui/ui.rs
use super::app::{App, AppMode};
use ratatui::{prelude::*, style::Stylize, widgets::*};
use crate::client::local_store::SyncStatus; 

pub fn draw(f: &mut Frame, app: &mut App) {
    if let AppMode::EditingTask = app.mode {
        draw_editor_ui(f, app);
        return;
    }

    let main_chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(0), Constraint::Length(3)])
        .split(f.size());

    let top_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(30), Constraint::Percentage(70)])
        .split(main_chunks[0]);
    
    draw_task_list(f, app, top_chunks[0]);
    draw_task_detail(f, app, top_chunks[1]);
    draw_status_and_help(f, app, main_chunks[1]);

    if let AppMode::NewChatPopup = app.mode {
        draw_new_chat_popup(f, app);
    }
}

fn draw_task_list(f: &mut Frame, app: &mut App, area: Rect) {
    // MODIFIED: Iterate over app.sessions
    let items: Vec<ListItem> = app.sessions.iter().map(|session| { 
        let sync_style = match session.sync_status {
            SyncStatus::Synced => Style::default().fg(Color::Green),
            SyncStatus::Modified => Style::default().fg(Color::Yellow),
            SyncStatus::Local => Style::default().fg(Color::Cyan),
            _ => Style::default(),
        };
        let remote_status = session.remote_status.as_deref().unwrap_or("-");
        
        let line = Line::from(vec![
            Span::styled(format!("{:<10}", format!("{:?}", session.sync_status)), sync_style),
            Span::raw(format!("{:<12}", remote_status)),
            Span::raw(session.title.clone()),
        ]);
        ListItem::new(line)
    }).collect();

    let title = format!("Sessions on {} (as {})", app.server_addr, app.username);

    let list = List::new(items)
        .block(Block::default().borders(Borders::ALL).title(title))
        .highlight_style(Style::default().add_modifier(Modifier::BOLD).bg(Color::DarkGray))
        .highlight_symbol("> ");
    f.render_stateful_widget(list, area, &mut app.task_list_state);
}

fn draw_task_detail(f: &mut Frame, app: &mut App, area: Rect) {
    // MODIFIED: Use app.get_selected_session()
    let text = if let Some(session) = app.get_selected_session() {
        vec![
            Line::from(vec![Span::raw("UUID: ").bold(), Span::raw(session.uuid.to_string())]),
            Line::from(vec![Span::raw("Title: ").bold(), Span::raw(session.title.clone())]),
            Line::from(vec![Span::raw("Created: ").bold(), Span::raw(session.created_at.to_rfc3339())]),
            Line::from(vec![Span::raw("Modified: ").bold(), Span::raw(session.modified_at.to_rfc3339())]),
            Line::from(vec![Span::raw("Sync Status: ").bold(), Span::raw(format!("{:?}", session.sync_status))]),
            Line::from(vec![Span::raw("Remote Status: ").bold(), Span::raw(session.remote_status.as_deref().unwrap_or("N/A"))]),
        ]
    } else {
        vec![Line::from("Select a session to see details.")]
    };
    
    let para = Paragraph::new(text)
        .wrap(Wrap { trim: true })
        .block(Block::default().borders(Borders::ALL).title("Details"));
    f.render_widget(para, area);
}

fn draw_status_and_help(f: &mut Frame, app: &mut App, area: Rect) {
    let help_text = get_help_text(app);
    let status_text = app.status_message.as_deref().unwrap_or("");

    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
        .split(area);
        
    let status = Paragraph::new(status_text)
        .block(Block::default().borders(Borders::ALL).title("Status"));
    f.render_widget(status, chunks[0]);
    
    let help = Paragraph::new(help_text)
        .block(Block::default().borders(Borders::ALL).title("Help"));
    f.render_widget(help, chunks[1]);
}

fn get_help_text(app: &App) -> String {
    let mut base = "j/k: Nav | r: Sync | n: New | q: Quit".to_string(); // "Refresh" is now "Sync"
    if let Some(session) = app.get_selected_session() {
        base.push_str(" | d: Delete | e: Edit");
        // MODIFIED: 's' is now for send/resend. Remote status can be checked for more context.
        if session.sync_status != SyncStatus::Synced || session.remote_status.as_deref() == Some("failed") {
            base.push_str(" | s: Send/Retry");
        }
    }
    base
}

fn draw_new_chat_popup(f: &mut Frame, app: &mut App) {
    // This function remains largely the same logic as before
    let area = centered_rect(60, 50, f.size());
    f.render_widget(Clear, area);
    let block = Block::default().title("Create New Chat").borders(Borders::ALL);
    f.render_widget(block, area);

    let popup_chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(2)
        .constraints([
            Constraint::Length(3), // Title
            Constraint::Min(5),    // System Prompt
            Constraint::Min(5),    // User Prompt
            Constraint::Length(1), // Buttons
        ].as_ref())
        .split(area);
        
    app.title_input.set_block(Block::default().borders(Borders::ALL).title("Title"));
    app.system_prompt_input.set_block(Block::default().borders(Borders::ALL).title("System Prompt (Optional)"));
    app.user_prompt_input.set_block(Block::default().borders(Borders::ALL).title("User Prompt"));

    f.render_widget(app.title_input.widget(), popup_chunks[0]);
    f.render_widget(app.system_prompt_input.widget(), popup_chunks[1]);
    f.render_widget(app.user_prompt_input.widget(), popup_chunks[2]);

    let buttons = Paragraph::new(" [Enter] Send | [Esc] Cancel ").alignment(Alignment::Center);
    f.render_widget(buttons, popup_chunks[3]);
}

fn draw_editor_ui(f: &mut Frame, app: &mut App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(0), Constraint::Length(1)])
        .split(f.size());

    // Set the block title
    let title = if let Some(uuid) = app.editor_task_uuid {
        format!("Editing Task: {} (Ctrl+S to Save, Esc to Cancel)", uuid)
    } else {
        "Editing Task (Ctrl+S to Save, Esc to Cancel)".to_string()
    };
    
    app.editor_textarea.set_block(
        Block::default()
            .borders(Borders::ALL)
            .title(title)
            .title_alignment(Alignment::Center)
    );

    f.render_widget(app.editor_textarea.widget(), chunks[0]);

    let help_text = Span::raw(" | Undo: Ctrl+Z | Redo: Ctrl+Y | ");
    let status_line = Line::from(vec![
        " EDIT MODE ".into(),
        help_text,
    ]).alignment(Alignment::Center);

    f.render_widget(Paragraph::new(status_line).style(Style::default().reversed()), chunks[1]);
}

fn centered_rect(percent_x: u16, percent_y: u16, r: Rect) -> Rect {
    let popup_layout = Layout::default().direction(Direction::Vertical)
        .constraints([Constraint::Percentage((100 - percent_y) / 2), Constraint::Percentage(percent_y), Constraint::Percentage((100 - percent_y) / 2),])
        .split(r);
    Layout::default().direction(Direction::Horizontal)
        .constraints([Constraint::Percentage((100 - percent_x) / 2), Constraint::Percentage(percent_x), Constraint::Percentage((100 - percent_x) / 2),])
        .split(popup_layout[1])[1]
}