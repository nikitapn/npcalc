#include "LogWindow.hpp"

#include <iostream>
#include <QTextEdit>
#include <QPushButton>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QCheckBox>
#include <QFileDialog>
#include <QMessageBox>
#include <QScrollBar>
#include <QTextStream>
#include <QCloseEvent>
#include <QDateTime>
#include <QFile>
#include <spdlog/spdlog.h>
#include <spdlog/sinks/qt_sinks.h>

LogWindow::LogWindow(QWidget* parent)
    : QWidget(parent)
    , autoScroll_(true)
{
    // Make this a standalone window
    setWindowFlags(Qt::Window | Qt::WindowCloseButtonHint | Qt::WindowMinMaxButtonsHint);

    setupUI();

    // Create the spdlog Qt color logger with a unique name
    int max_lines = 1000; // keep the text widget to max 1000 lines
    std::string logger_name = "nscalc_proxy_client_" + std::to_string(reinterpret_cast<uintptr_t>(this));
    logger_ = spdlog::qt_color_logger_mt(logger_name, logTextEdit_, max_lines);
    logger_->set_level(spdlog::level::info);

    // Set a custom pattern for better formatting
    logger_->set_pattern("[%H:%M:%S.%e] [%l] %v");

    // Set window properties
    setWindowTitle("NSCalc Proxy Client - Log");
    resize(800, 600);

    // Don't delete on close, just hide
    setAttribute(Qt::WA_DeleteOnClose, false);

    logRedirectStdOut_ = std::move(std::make_unique<
        nplib::SpdlogRedirect<char>>(std::cout, logger_));
    logRedirectStdErr_ = std::move(std::make_unique<
        nplib::SpdlogRedirect<char>>(std::cerr, logger_));
}

LogWindow::~LogWindow()
{
  spdlog::drop(logger_->name()); // Remove logger from registry
}

std::shared_ptr<spdlog::logger> LogWindow::getLogger() const
{
    return logger_;
}

void LogWindow::setupUI()
{
    // Create main layout
    mainLayout_ = new QVBoxLayout(this);

    // Create log text edit
    logTextEdit_ = new QTextEdit();
    logTextEdit_->setReadOnly(true);
    logTextEdit_->setFont(QFont("Consolas", 9)); // Use monospace font

    // Create button layout
    buttonLayout_ = new QHBoxLayout();

    // Create buttons and checkbox
    clearButton_ = new QPushButton("Clear Log");
    saveButton_ = new QPushButton("Save Log...");
    autoScrollCheckBox_ = new QCheckBox("Auto-scroll");
    autoScrollCheckBox_->setChecked(autoScroll_);

    // Add widgets to button layout
    buttonLayout_->addWidget(clearButton_);
    buttonLayout_->addWidget(saveButton_);
    buttonLayout_->addStretch(); // Add space between buttons and checkbox
    buttonLayout_->addWidget(autoScrollCheckBox_);

    // Add widgets to main layout
    mainLayout_->addWidget(logTextEdit_);
    mainLayout_->addLayout(buttonLayout_);

    // Connect signals
    connect(clearButton_, &QPushButton::clicked, this, &LogWindow::clearLog);
    connect(saveButton_, &QPushButton::clicked, this, &LogWindow::saveLog);
    connect(autoScrollCheckBox_, &QCheckBox::toggled, this, &LogWindow::toggleAutoScroll);
}

void LogWindow::clearLog()
{
    logTextEdit_->clear();
}

void LogWindow::toggleAutoScroll(bool enabled)
{
    autoScroll_ = enabled;
    // The auto-scroll functionality is handled in the sink itself
}

void LogWindow::saveLog()
{
    QString fileName = QFileDialog::getSaveFileName(
        this,
        "Save Log File",
        QString("nscalc_proxy_log_%1.txt").arg(QDateTime::currentDateTime().toString("yyyyMMdd_hhmmss")),
        "Text Files (*.txt);;All Files (*)"
    );

    if (!fileName.isEmpty()) {
        QFile file(fileName);
        if (file.open(QIODevice::WriteOnly | QIODevice::Text)) {
            QTextStream stream(&file);
            stream << logTextEdit_->toPlainText();
            file.close();

            QMessageBox::information(this, "Log Saved", 
                QString("Log saved successfully to:\n%1").arg(fileName));
        } else {
            QMessageBox::warning(this, "Save Error", 
                QString("Could not save log file:\n%1").arg(fileName));
        }
    }
}

void LogWindow::closeEvent(QCloseEvent* event)
{
    // Hide the window instead of closing it
    hide();
    event->ignore();
    windowHidden(); // Emit signal when window is hidden
}
