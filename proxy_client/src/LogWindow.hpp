#pragma once

#include <QWidget>
#include <QTextEdit>
#include <QVBoxLayout>
#include <QPushButton>
#include <QHBoxLayout>
#include <QCheckBox>
#include <memory>
#include <spdlog/logger.h>
#include <nplib/utils/spdlog_redirect.hpp>

QT_BEGIN_NAMESPACE
class QTextEdit;
class QPushButton;
class QVBoxLayout;
class QHBoxLayout;
class QCheckBox;
QT_END_NAMESPACE

class LogWindow : public QWidget
{
    Q_OBJECT

public:
    explicit LogWindow(QWidget* parent = nullptr);
    ~LogWindow();

    // Get the spdlog logger for this log window
    std::shared_ptr<spdlog::logger> getLogger() const;

protected:
    void closeEvent(QCloseEvent* event) override;

private slots:
    void clearLog();
    void toggleAutoScroll(bool enabled);
    void saveLog();

Q_SIGNALS:
    void windowHidden();

private:
    void setupUI();

    QTextEdit* logTextEdit_;
    QPushButton* clearButton_;
    QPushButton* saveButton_;
    QCheckBox* autoScrollCheckBox_;
    QVBoxLayout* mainLayout_;
    QHBoxLayout* buttonLayout_;
    
    std::shared_ptr<spdlog::logger> logger_;
    std::unique_ptr<nplib::SpdlogRedirect<char>> logRedirectStdOut_;
    std::unique_ptr<nplib::SpdlogRedirect<char>> logRedirectStdErr_;

    bool autoScroll_;
};
