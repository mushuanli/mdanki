// src/client/tui/ui.rs
use super::app::{App, AppMode};
use crate::client::network::RemoteTask;
use ratatui::{prelude::*, style::Stylize, widgets::*}; // FIX: Import Stylize trait for .bold()

pub fn draw(f: &mut Frame, app: &mut App) {
    // Main three-column layout
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
    let items: Vec<ListItem> = app.tasks.iter().map(|task| {
        let status_style = match task.status.as_str() {
            "completed" => Style::default().fg(Color::Green),
            "failed" => Style::default().fg(Color::Red),
            "processing" => Style::default().fg(Color::Cyan),
            _ => Style::default().fg(Color::Yellow),
        };
        let line = Line::from(vec![
            Span::styled(format!("{:<12}", task.status), status_style),
            Span::raw(task.title.clone()),
        ]);
        ListItem::new(line)
    }).collect();

    let list = List::new(items)
        .block(Block::default().borders(Borders::ALL).title("Tasks"))
        .highlight_style(Style::default().add_modifier(Modifier::BOLD).bg(Color::DarkGray))
        .highlight_symbol("> ");
    f.render_stateful_widget(list, area, &mut app.task_list_state);
}

fn draw_task_detail(f: &mut Frame, app: &mut App, area: Rect) {
    // FIX: `Paragraph::new` takes a Vec<Line> (or something convertible to Text), not just a string.
    // Also, Span::bold() takes one argument, not two. Use Span::styled() for more control.
    let text = if let Some(task) = app.get_selected_task() {
        let mut lines = vec![
            Line::from(vec![Span::raw("UUID: ").bold(), Span::raw(task.uuid.to_string())]),
            Line::from(vec![Span::raw("Title: ").bold(), Span::raw(task.title.clone())]),
            Line::from(vec![Span::raw("Created: ").bold(), Span::raw(task.created_at.to_rfc3339())]),
            Line::from(vec![Span::raw("Status: ").bold(), Span::raw(task.status.clone())]),
        ];
        if let Some(err) = &task.error_message {
            lines.push(Line::from(vec![Span::raw("Error: ").bold().red(), Span::styled(err, Style::default().fg(Color::Red))]));
        }
        lines
    } else {
        vec![Line::from("Select a task to see details.")]
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
    let mut base = "j/k: Nav | r: Refresh | n: New | q: Quit".to_string();
    if let Some(task) = app.get_selected_task() {
        base.push_str(" | d: Delete");
        match task.status.as_str() {
            "pending" | "failed" => base.push_str(" | s: Resend"),
            "completed" => base.push_str(" | w: Download"),
            _ => {}
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

fn centered_rect(percent_x: u16, percent_y: u16, r: Rect) -> Rect { /* unchanged */
    let popup_layout = Layout::default().direction(Direction::Vertical)
        .constraints([Constraint::Percentage((100 - percent_y) / 2), Constraint::Percentage(percent_y), Constraint::Percentage((100 - percent_y) / 2),])
        .split(r);
    Layout::default().direction(Direction::Horizontal)
        .constraints([Constraint::Percentage((100 - percent_x) / 2), Constraint::Percentage(percent_x), Constraint::Percentage((100 - percent_x) / 2),])
        .split(popup_layout[1])[1]
}