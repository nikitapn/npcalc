// Copyright (C) 2016 The Qt Company Ltd.
// SPDX-License-Identifier: LicenseRef-Qt-Commercial OR BSD-3-Clause

#include "MainWindow.hpp"
#include "LogWindow.hpp"

#include <QAction>
#include <QCheckBox>
#include <QComboBox>
#include <QCoreApplication>
#include <QCloseEvent>
#include <QGroupBox>
#include <QLabel>
#include <QLineEdit>
#include <QMenu>
#include <QPushButton>
#include <QSpinBox>
#include <QTextEdit>
#include <QVBoxLayout>
#include <QGridLayout>
#include <QMessageBox>
#include <QFrame>
#include <functional>

#include <spdlog/spdlog.h>

#include "proxy.hpp"

//! [0]
Window::Window()
  : currentStatus_(ProxyStatus::Disconnected)
  , actualPassword_("1234") // Default password
{
  // Create log window first (as independent window)
  logWindow_ = std::make_unique<LogWindow>(nullptr);
  
  // Set the Qt logger as the default logger, but first drop any existing default logger
  spdlog::drop_all(); // Clear all existing loggers
  spdlog::set_default_logger(logWindow_->getLogger());
  
  // Log application startup
  spdlog::info("NSCalc Proxy Client starting up...");
  
  createMainGroupBox();
  createActions();
  createTrayIcon();

  connect(connectButton, &QAbstractButton::clicked, this, &Window::onButtonConnectClicked);
  connect(showLogButton, &QAbstractButton::clicked, this, &Window::showLogWindow);
  connect(logWindow_.get(), &LogWindow::windowHidden, this, &Window::onLogWindowHidden);
  connect(editConfigCheckBox, &QCheckBox::toggled, this, &Window::onEditConfigToggled);
  connect(trayIcon, &QSystemTrayIcon::messageClicked, this, &Window::onButtonConnectClicked);
  connect(trayIcon, &QSystemTrayIcon::activated, this, &Window::iconActivated);

  QVBoxLayout* mainLayout = new QVBoxLayout;
  mainLayout->addWidget(configGroupBox);
  setLayout(mainLayout);

  // Initialize UI state
  updatePasswordField();
  updateStatusIndicator(currentStatus_);

  trayIcon->show();

  setWindowTitle(tr("Proxy Client"));
  resize(450, 200);

  setWindowFlags(Qt::Window | Qt::MSWindowsFixedSizeDialogHint);
}

void Window::setVisible(bool visible)
{
  minimizeAction->setEnabled(visible);
  restoreAction->setEnabled(isMaximized() || !visible);
  QDialog::setVisible(visible);
}

void Window::closeEvent(QCloseEvent* event)
{
  if (!event->spontaneous() || !isVisible())
    return;
  if (trayIcon->isVisible()) {
    /*QMessageBox::information(this, tr("Systray"),
      tr("The program will keep running in the "
        "system tray. To terminate the program, "
        "choose <b>Quit</b> in the context menu "
        "of the system tray entry."));*/
    hide();
    event->ignore();
  }
}

void Window::iconActivated(QSystemTrayIcon::ActivationReason reason)
{
  switch (reason) {
  case QSystemTrayIcon::Trigger:
  case QSystemTrayIcon::DoubleClick:
    // Show the main window when the icon is clicked
    if (isVisible()) {
      showNormal();
      raise();
    } else {
      show();
      activateWindow();
    }
    break;
  case QSystemTrayIcon::MiddleClick:
    break;
  default:
    ;
  }
}

void Window::onProxyStatusChanged(ProxyStatus status)
{
  currentStatus_ = status;
  updateStatusIndicator(status);
  
  // Update connect button text based on status
  switch (status) {
    case ProxyStatus::Disconnected:
    case ProxyStatus::Error:
      connectButton->setText(tr("Connect"));
      connectButton->setEnabled(true);
      break;
    case ProxyStatus::Connecting:
      connectButton->setText(tr("Connecting..."));
      connectButton->setEnabled(false);
      break;
    case ProxyStatus::Connected:
      connectButton->setText(tr("Disconnect"));
      connectButton->setEnabled(true);
      break;
  }
}

void Window::onButtonConnectClicked()
{
  if (currentStatus_ == ProxyStatus::Connected) {
    // Disconnect
    spdlog::info("Disconnecting from proxy server");
    proxy_.reset();
    onProxyStatusChanged(ProxyStatus::Disconnected);
    return;
  }

  if (currentStatus_ == ProxyStatus::Connecting) {
    return; // Already connecting
  }

  // Get connection parameters from UI
  QString hostname = hostnameEdit->text().trimmed();
  QString port = portEdit->text().trimmed();
  QString login = loginEdit->text().trimmed();
  QString password = editConfigCheckBox->isChecked() ? passwordEdit->text() : actualPassword_;

  if (hostname.isEmpty() || port.isEmpty() || login.isEmpty() || password.isEmpty()) {
    spdlog::warn("Connection attempt failed: missing required fields");
    QMessageBox::warning(this, tr("Warning"), tr("Please fill in all connection fields."));
    return;
  }

  spdlog::info("Attempting to connect to proxy server {}:{} with user '{}'", 
               hostname.toStdString(), port.toStdString(), login.toStdString());

  onProxyStatusChanged(ProxyStatus::Connecting);

  proxy_ = Proxy::create();
  try {
    proxy_->connect(
      hostname.toStdString(), 
      port.toStdString(), 
      login.toStdString(), 
      password.toStdString(), 
      std::bind(&Window::onProxyStatusChanged, this, std::placeholders::_1)
    );
    spdlog::info("Successfully connected to proxy server");
    onProxyStatusChanged(ProxyStatus::Connected);
  } catch (const proxy::AuthorizationFailed& e) {
    spdlog::error("Authorization failed: {}", e.what());
    onProxyStatusChanged(ProxyStatus::Error);
    QMessageBox::critical(this, tr("Error"), tr("Authorization failed: %1").arg(e.what()));
    return;
  } catch (const nprpc::Exception& e) {
    spdlog::error("Failed to connect to proxy server: {}", e.what());
    onProxyStatusChanged(ProxyStatus::Error);
    QMessageBox::critical(this, tr("Error"), tr("Failed to connect to proxy server: %1").arg(e.what()));
    return;
  } catch (const std::exception& e) {
    spdlog::error("Unexpected error occurred: {}", e.what());
    onProxyStatusChanged(ProxyStatus::Error);
    QMessageBox::critical(this, tr("Error"), tr("An unexpected error occurred: %1").arg(e.what()));
    return;
  } catch (...) {
    spdlog::error("Unknown error occurred while connecting to the proxy server");
    onProxyStatusChanged(ProxyStatus::Error);
    QMessageBox::critical(this, tr("Error"), tr("An unknown error occurred while connecting to the proxy server."));
    return;
  }
}

void Window::createMainGroupBox()
{
  configGroupBox = new QGroupBox();
  
  // Create "Edit Config" checkbox at the top
  editConfigCheckBox = new QCheckBox(tr("Edit Config"));
  editConfigCheckBox->setChecked(false);
  
  // Create configuration input fields
  hostnameEdit = new QLineEdit("calc.nikitapn.com");
  // hostnameEdit = new QLineEdit("archvm.lan");
  portEdit = new QLineEdit("443");
  loginEdit = new QLineEdit("superuser");
  passwordEdit = new QLineEdit();
  passwordEdit->setEchoMode(QLineEdit::Password);
  
  // Create status section
  statusIndicator = new QFrame();
  statusIndicator->setFixedSize(20, 20);
  statusIndicator->setFrameStyle(QFrame::Box);
  statusIndicator->setStyleSheet("border-radius: 10px; background-color: red;");
  
  statusLabel = new QLabel(tr("Status:\nDisconnected."));
  
  // Create connect button
  connectButton = new QPushButton(tr("Connect"));
  connectButton->setDefault(true);
  connectButton->setMinimumHeight(40);
  
  // Create show log button
  showLogButton = new QPushButton(tr("Show Log"));
  showLogButton->setMinimumHeight(30);

  // Layout everything
  QGridLayout* layout = new QGridLayout;
  
  // Row 0: Edit Config checkbox
  layout->addWidget(editConfigCheckBox, 0, 0, 1, 2);
  
  // Left side - Configuration fields (rows 1-4)
  layout->addWidget(new QLabel(tr("hostname = ")), 1, 0);
  layout->addWidget(hostnameEdit, 1, 1);
  
  layout->addWidget(new QLabel(tr("port = ")), 2, 0);
  layout->addWidget(portEdit, 2, 1);
  
  layout->addWidget(new QLabel(tr("login = ")), 3, 0);
  layout->addWidget(loginEdit, 3, 1);
  
  layout->addWidget(new QLabel(tr("password = ")), 4, 0);
  layout->addWidget(passwordEdit, 4, 1);
  
  // Right side - Status and button (spanning multiple rows)
  QVBoxLayout* rightLayout = new QVBoxLayout;
  
  QHBoxLayout* statusLayout = new QHBoxLayout;
  statusLayout->addWidget(statusLabel);
  statusLayout->addStretch();
  statusLayout->addWidget(statusIndicator);
  
  rightLayout->addLayout(statusLayout);
  rightLayout->addStretch();
  rightLayout->addWidget(connectButton);
  rightLayout->addWidget(showLogButton);
  
  QWidget* rightWidget = new QWidget;
  rightWidget->setLayout(rightLayout);
  rightWidget->setMinimumWidth(200);
  
  layout->addWidget(rightWidget, 1, 2, 4, 1);
  
  // Set column stretch to make the layout responsive
  layout->setColumnStretch(1, 1);
  layout->setColumnStretch(2, 1);
  
  configGroupBox->setLayout(layout);
}

void Window::createActions()
{
  minimizeAction = new QAction(tr("Mi&nimize"), this);
  connect(minimizeAction, &QAction::triggered, this, &QWidget::hide);

  restoreAction = new QAction(tr("&Restore"), this);
  connect(restoreAction, &QAction::triggered, this, &QWidget::showNormal);

  showLogAction = new QAction(tr("Show &Log"), this);
  connect(showLogAction, &QAction::triggered, this, &Window::showLogWindow);

  quitAction = new QAction(tr("&Quit"), this);
  connect(quitAction, &QAction::triggered, qApp, &QCoreApplication::quit);
}

void Window::createTrayIcon()
{
  trayIconMenu = new QMenu(this);
  trayIconMenu->addAction(minimizeAction);
  trayIconMenu->addAction(restoreAction);
  trayIconMenu->addSeparator();
  trayIconMenu->addAction(showLogAction);
  trayIconMenu->addSeparator();
  trayIconMenu->addAction(quitAction);

  trayIcon = new QSystemTrayIcon(this);
  trayIcon->setContextMenu(trayIconMenu);

  auto icon = QIcon(":/images/app_icon.png");
  trayIcon->setIcon(icon);
  setWindowIcon(icon);
}

void Window::updateStatusIndicator(ProxyStatus status)
{
  QString color;
  QString statusText;
  QString buttonText = tr("Connect");
  
  switch (status) {
    case ProxyStatus::Disconnected:
      color = "red";
      statusText = tr("Status:\nDisconnected.");
      break;
    case ProxyStatus::Connecting:
      color = "yellow";
      statusText = tr("Status:\nConnecting...");
      break;
    case ProxyStatus::Connected:
      color = "green";
      statusText = tr("Status:\nConnected.");
      buttonText = tr("Disconnect");
      break;
    case ProxyStatus::Error:
      color = "red";
      statusText = tr("Status:\nError.");
      break;
  }
  
  statusIndicator->setStyleSheet(QString("border-radius: 10px; background-color: %1; border: 1px solid black;").arg(color));
  statusLabel->setText(statusText);
  connectButton->setText(buttonText);
}

void Window::updatePasswordField()
{
  if (editConfigCheckBox->isChecked()) {
    passwordEdit->setEchoMode(QLineEdit::Normal);
    passwordEdit->setText(actualPassword_);
    passwordEdit->setEnabled(true);
  } else {
    passwordEdit->setEchoMode(QLineEdit::Password);
    passwordEdit->setText(actualPassword_);
    passwordEdit->setEnabled(false);
  }
}

void Window::onEditConfigToggled(bool enabled)
{
  // Enable/disable editing of all config fields
  hostnameEdit->setEnabled(enabled);
  portEdit->setEnabled(enabled);
  loginEdit->setEnabled(enabled);
  
  // Update password field display
  if (enabled) {
    // Save the actual password when switching to edit mode
    actualPassword_ = passwordEdit->text();
  }
  updatePasswordField();
}

void Window::dispose()
{
  proxy_.reset();
  logWindow_.reset();
}

void Window::showLogWindow()
{
  spdlog::info("Opening log window");
  logWindow_->show();
  logWindow_->raise();
  logWindow_->activateWindow();
  // Disable the button while log window is open
  showLogButton->setEnabled(false);
}

void Window::onLogWindowHidden()
{
  showLogButton->setEnabled(true);
}