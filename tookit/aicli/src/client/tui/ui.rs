// src/client/tui/ui.rs

use ratatui::{
    layout::{Constraint, Direction, Layout, Rect, Alignment},
    style::{Color, Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Borders, List, ListItem,ListState, Paragraph, Clear},
    Frame,
};

use super::app::{App, AppMode, InputMode}; // Import InputMode
use crate::client::local_store::SyncStatus;

pub fn draw(f: &mut Frame, app: &mut App, area: Rect) {
    // We draw the main task list in the background regardless
    draw_task_list(f, app, area);
    
    // Then, if in a popup mode, draw it on top
    match app.mode.clone() { // Clone to avoid borrow issues
        AppMode::NewChatPopup => draw_new_chat_popup(f, app),
        AppMode::EditingTask => draw_editor(f, app, area),
        AppMode::ViewingTask => draw_viewer(f, app, area),
        AppMode::AppendPromptPopup => draw_append_popup(f, app),
        AppMode::TaskList => {}
    }
}

fn draw_viewer(f: &mut Frame, app: &mut App, area: Rect) {
    let viewer_block = Block::default()
        .title(" 📜 View Session (Read-Only) ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Yellow))
        .border_type(ratatui::widgets::BorderType::Rounded);
    
    // We'll use a Paragraph for simplicity as TextArea is for editing
    let paragraph = Paragraph::new(app.viewer_content.clone())
        .block(viewer_block)
        .wrap( ratatui::widgets::Wrap { trim: false } );

    f.render_widget(paragraph, area);
}

fn draw_append_popup(f: &mut Frame, app: &mut App) {
    let block = Block::default()
        .title(" 💬 Append Prompt ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Cyan))
        .border_type(ratatui::widgets::BorderType::Rounded);
    
    // A smaller popup for just one input
    let area = centered_rect(50, 25, f.size());
    f.render_widget(Clear, area);
    f.render_widget(block.clone(), area);

    // Set style for the input
    app.append_prompt_input.set_style(Style::default().fg(Color::Cyan));
    
    // Render the text area inside the block
    f.render_widget(app.append_prompt_input.widget(), block.inner(area));
}

fn draw_new_chat_popup(f: &mut Frame, app: &mut App) {
    let popup_title = " 📝 New Chat Session ";
    let block = Block::default().title(popup_title).borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Cyan))
        .border_type(ratatui::widgets::BorderType::Rounded);
    
    // Create a centered area for the popup
    let area = centered_rect(60, 80, f.size());
    f.render_widget(Clear, area);
    f.render_widget(block, area);

    // Create layout for inputs inside the popup
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(2)
        .constraints([
            Constraint::Length(3),       // Title
            Constraint::Min(5),          // User Prompt (takes most of the space)
            Constraint::Length(5),       // Model Selector
            Constraint::Length(3),       // System Prompt (fixed small height)
            Constraint::Length(1),       // Help text
        ].as_ref())
        .split(area);
        
    // --- MODIFIED: Adjust style handling to match the new order ---
    let (title_style, user_style, model_style, system_style) = match app.new_chat_popup_active_input {
        InputMode::Title       => (Style::default().fg(Color::Cyan), Style::default(), Style::default(), Style::default()),
        InputMode::UserPrompt  => (Style::default(), Style::default().fg(Color::Cyan), Style::default(), Style::default()),
        InputMode::Model       => (Style::default(), Style::default(), Style::default().fg(Color::Cyan), Style::default()),
        InputMode::SystemPrompt=>(Style::default(), Style::default(), Style::default(), Style::default().fg(Color::Cyan)),
    };
    
    app.title_input.set_style(title_style);
    app.user_prompt_input.set_style(user_style);
    app.system_prompt_input.set_style(system_style);

    // --- MODIFIED: Render in the new order ---
    f.render_widget(app.title_input.widget(), chunks[0]);
    f.render_widget(app.user_prompt_input.widget(), chunks[1]);
    
    // Render Model List (logic is the same, just new position)
    let model_items: Vec<ListItem> = app.models.iter()
        .map(|model_identifier| ListItem::new(model_identifier.as_str()))
        .collect();

    let mut model_list_state = ListState::default();
    model_list_state.select(Some(app.selected_model_index));

    let model_list = List::new(model_items)
        .block(Block::default().borders(Borders::ALL).title(" Model ").border_style(model_style))
        .highlight_style(Style::default().add_modifier(Modifier::REVERSED))
        .highlight_symbol(">> ");
        
    f.render_stateful_widget(model_list, chunks[2], &mut model_list_state);
    
    f.render_widget(app.system_prompt_input.widget(), chunks[3]);

    let help_text = Text::from("Press <Tab> to cycle inputs, <Enter> to send, <Esc> to cancel");
    let help_paragraph = Paragraph::new(help_text)
        .style(Style::default().fg(Color::Gray))
        .alignment(Alignment::Center);
    f.render_widget(help_paragraph, chunks[4]);
}

// Helper function to create a centered rect for popups
fn centered_rect(percent_x: u16, percent_y: u16, r: Rect) -> Rect {
    let popup_layout = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Percentage((100 - percent_y) / 2),
            Constraint::Percentage(percent_y),
            Constraint::Percentage((100 - percent_y) / 2),
        ])
        .split(r);

    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage((100 - percent_x) / 2),
            Constraint::Percentage(percent_x),
            Constraint::Percentage((100 - percent_x) / 2),
        ])
        .split(popup_layout[1])[1]
}


fn draw_task_list(f: &mut Frame, app: &mut App, area: Rect) {
    let title = format!(
        " 💬 AI-CLI Sessions (User: {} @ {}) ",
        app.username, app.server_addr
    );
    let task_list_block = Block::default()
        .title(title)
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Cyan))
        .border_type(ratatui::widgets::BorderType::Rounded);

    // 在块内渲染任务列表
    let inner_area = task_list_block.inner(area);
    f.render_widget(task_list_block, area);

    // 添加任务列表标题行
    let header = Line::from(vec![
        Span::styled("Status", Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
        Span::raw(" | "),
        Span::styled("Date", Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)),
        Span::raw(" | "),
        Span::styled("Title", Style::default().fg(Color::Blue).add_modifier(Modifier::BOLD)),
    ]);

    let header_paragraph = Paragraph::new(header)
        .style(Style::default().bg(Color::DarkGray))
        .alignment(Alignment::Left);
    
    // 分割内部区域，留出标题行空间
    let task_area = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1), // 标题行
            Constraint::Min(1),    // 任务列表
        ])
        .split(inner_area);

    // 渲染标题行
    f.render_widget(header_paragraph, task_area[0]);

    // 创建任务列表项
    let tasks: Vec<ListItem> = app.sessions.iter().map(|session| {
        // 根据同步状态设置颜色
        let status_color = match session.sync_status {
            SyncStatus::Local => Color::Yellow,
            SyncStatus::Modified => Color::Cyan,
            SyncStatus::Pending => Color::Gray,
            SyncStatus::Processing => Color::Blue,
            SyncStatus::Done => Color::Green,
            SyncStatus::Failed => Color::Red,
            SyncStatus::Finish => Color::Gray,
            SyncStatus::Conflict => Color::Magenta,
        };
        let status_text = format!("{:?}", session.sync_status);

        let line = Line::from(vec![
            Span::styled(format!("{:<10}", status_text), Style::default().fg(status_color)),
            Span::raw(" | "),
            Span::styled(
                format!("{:<10}", session.created_at.format("%Y-%m-%d")),
                Style::default().fg(Color::Yellow),
            ),
            Span::raw(" | "),
            Span::raw(&session.title),
        ]);

        ListItem::new(line)
    }).collect();

    // 创建任务列表
    let list = List::new(tasks)
        .highlight_style(Style::default().add_modifier(Modifier::REVERSED))
        .highlight_symbol(">> ");
    f.render_stateful_widget(list, task_area[1], &mut app.task_list_state);
}

fn draw_editor(f: &mut Frame, app: &mut App, area: Rect) {
    // 创建编辑区域块
    let editor_block = Block::default()
        .title(" Editing Session ")
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Cyan))
        .border_type(ratatui::widgets::BorderType::Rounded);
    
    let inner_area = editor_block.inner(area);
    f.render_widget(editor_block, area);

    // 分割内部区域
    let editor_layout = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Min(1),    // 文本编辑区
            Constraint::Length(1), // 帮助提示
        ])
        .split(inner_area);
    
    // 渲染文本编辑区
    app.editor_textarea.set_block(
        Block::default()
            .borders(Borders::NONE)
    );
    f.render_widget(app.editor_textarea.widget(), editor_layout[0]);
    
    // 渲染编辑模式帮助信息
    let help_text = "CTRL+S: Save and Sync | Esc: Cancel";
    let help_paragraph = Paragraph::new(help_text)
        .style(Style::default().fg(Color::Gray))
        .alignment(Alignment::Center);
    f.render_widget(help_paragraph, editor_layout[1]);
}
