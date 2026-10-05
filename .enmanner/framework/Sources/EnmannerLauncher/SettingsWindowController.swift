import AppKit
import EnmannerCore

@MainActor
final class SettingsWindowController: NSWindowController {
    private let settings: AppSettings
    private let projectURL: URL
    private let userConfiguration: EnmannerManifest.UserConfiguration?
    private let recentOutputCheckbox = NSButton(
        checkboxWithTitle: "Include recent server output in error messages",
        target: nil,
        action: nil
    )
    private let projectStatusLabel = NSTextField(
        wrappingLabelWithString: ""
    )
    private var fieldControls: [String: NSControl] = [:]
    private var secretFieldControls: [String: RevealableSecureField] = [:]
    private var fieldsByBrowseButton: [
        ObjectIdentifier: EnmannerManifest.UserConfiguration.Field
    ] = [:]
    private var saveAndRestartButton: NSButton?

    var onSaveAndRestart: (() -> Void)?

    init(
        settings: AppSettings,
        projectURL: URL,
        userConfiguration: EnmannerManifest.UserConfiguration?
    ) {
        self.settings = settings
        self.projectURL = projectURL
        self.userConfiguration = userConfiguration

        let window = NSWindow(
            contentRect: NSRect(
                x: 0,
                y: 0,
                width: userConfiguration == nil ? 560 : 760,
                height: userConfiguration == nil ? 320 : 640
            ),
            styleMask: [.titled, .closable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Settings"
        window.minSize = NSSize(width: 560, height: 420)
        window.isReleasedWhenClosed = false
        window.setFrameAutosaveName("EnmannerSettingsWindowV2")
        window.center()
        super.init(window: window)

        configureViews()
        refresh()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func showWindow(_ sender: Any?) {
        refresh()
        super.showWindow(sender)
        window?.makeKeyAndOrderFront(sender)
    }

    func showProjectMessage(_ message: String) {
        projectStatusLabel.textColor = .systemOrange
        projectStatusLabel.stringValue = message
    }

    private func configureViews() {
        guard let window else { return }

        let contentView = NSView()
        window.contentView = contentView

        if let userConfiguration {
            let projectView = makeProjectView(
                configuration: userConfiguration
            )
            projectView.translatesAutoresizingMaskIntoConstraints = false
            contentView.addSubview(projectView)
            NSLayoutConstraint.activate([
                projectView.leadingAnchor.constraint(
                    equalTo: contentView.leadingAnchor
                ),
                projectView.trailingAnchor.constraint(
                    equalTo: contentView.trailingAnchor
                ),
                projectView.topAnchor.constraint(
                    equalTo: contentView.topAnchor
                ),
                projectView.bottomAnchor.constraint(
                    equalTo: contentView.bottomAnchor
                )
            ])
            return
        }

        let generalView = makeGeneralView()
        generalView.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(generalView)
        NSLayoutConstraint.activate([
            generalView.leadingAnchor.constraint(
                equalTo: contentView.leadingAnchor
            ),
            generalView.trailingAnchor.constraint(
                equalTo: contentView.trailingAnchor
            ),
            generalView.topAnchor.constraint(
                equalTo: contentView.topAnchor
            ),
            generalView.bottomAnchor.constraint(
                equalTo: contentView.bottomAnchor
            )
        ])
    }

    private func makeGeneralView() -> NSView {
        let view = NSView()
        let titleLabel = NSTextField(labelWithString: "App Settings")
        titleLabel.font = .systemFont(ofSize: 20, weight: .semibold)

        recentOutputCheckbox.target = self
        recentOutputCheckbox.action = #selector(settingChanged)

        let stack = NSStackView(views: [titleLabel, recentOutputCheckbox])
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 14
        view.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(
                equalTo: view.leadingAnchor,
                constant: 28
            ),
            stack.trailingAnchor.constraint(
                lessThanOrEqualTo: view.trailingAnchor,
                constant: -20
            ),
            stack.topAnchor.constraint(
                equalTo: view.topAnchor,
                constant: 28
            )
        ])
        return view
    }

    private func makeProjectView(
        configuration: EnmannerManifest.UserConfiguration
    ) -> NSView {
        let horizontalInset: CGFloat = 28
        let focusRingGutter: CGFloat = 4
        let view = NSView()
        let scrollView = NSScrollView()
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.hasVerticalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.drawsBackground = false

        let documentView = FlippedView()
        documentView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.documentView = documentView

        var arrangedViews: [NSView] = []
        for field in configuration.fields {
            arrangedViews.append(makeFieldView(field))
        }

        projectStatusLabel.textColor = .secondaryLabelColor
        projectStatusLabel.font = .systemFont(ofSize: 11)

        let stack = NSStackView(views: arrangedViews)
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.orientation = .vertical
        stack.alignment = .width
        stack.spacing = 12
        documentView.addSubview(stack)

        recentOutputCheckbox.target = self
        recentOutputCheckbox.action = #selector(settingChanged)
        let saveButton = NSButton(
            title: "Save & Restart",
            target: self,
            action: #selector(saveProjectConfiguration)
        )
        saveButton.translatesAutoresizingMaskIntoConstraints = false
        saveButton.keyEquivalent = "\r"
        saveAndRestartButton = saveButton

        let footerSpacer = NSView()
        footerSpacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
        projectStatusLabel.setContentCompressionResistancePriority(
            .defaultLow,
            for: .horizontal
        )
        let footer = NSStackView(
            views: [
                recentOutputCheckbox,
                projectStatusLabel,
                footerSpacer,
                saveButton
            ]
        )
        footer.translatesAutoresizingMaskIntoConstraints = false
        footer.orientation = .horizontal
        footer.alignment = .centerY
        footer.spacing = 12

        view.addSubview(scrollView)
        view.addSubview(footer)

        NSLayoutConstraint.activate([
            scrollView.leadingAnchor.constraint(
                equalTo: view.leadingAnchor,
                constant: horizontalInset - focusRingGutter
            ),
            scrollView.trailingAnchor.constraint(
                equalTo: view.trailingAnchor,
                constant: -(horizontalInset - focusRingGutter)
            ),
            scrollView.topAnchor.constraint(
                equalTo: view.topAnchor,
                constant: 24
            ),
            scrollView.bottomAnchor.constraint(
                equalTo: footer.topAnchor,
                constant: -12
            ),
            footer.leadingAnchor.constraint(
                equalTo: view.leadingAnchor,
                constant: 28
            ),
            footer.trailingAnchor.constraint(
                equalTo: view.trailingAnchor,
                constant: -28
            ),
            footer.bottomAnchor.constraint(
                equalTo: view.bottomAnchor,
                constant: -20
            ),

            documentView.leadingAnchor.constraint(
                equalTo: scrollView.contentView.leadingAnchor
            ),
            documentView.trailingAnchor.constraint(
                equalTo: scrollView.contentView.trailingAnchor
            ),
            documentView.topAnchor.constraint(
                equalTo: scrollView.contentView.topAnchor
            ),
            documentView.widthAnchor.constraint(
                equalTo: scrollView.contentView.widthAnchor
            ),

            stack.leadingAnchor.constraint(
                equalTo: documentView.leadingAnchor,
                constant: focusRingGutter
            ),
            stack.trailingAnchor.constraint(
                equalTo: documentView.trailingAnchor,
                constant: -focusRingGutter
            ),
            stack.topAnchor.constraint(
                equalTo: documentView.topAnchor,
                constant: 4
            ),
            stack.bottomAnchor.constraint(
                equalTo: documentView.bottomAnchor,
                constant: -12
            ),
            projectStatusLabel.widthAnchor.constraint(
                lessThanOrEqualToConstant: 300
            )
        ])
        return view
    }

    private func makeFieldView(
        _ field: EnmannerManifest.UserConfiguration.Field
    ) -> NSView {
        if field.type == .boolean {
            let checkbox = NSButton(
                checkboxWithTitle: "",
                target: nil,
                action: nil
            )
            checkbox.setAccessibilityLabel(field.label)
            fieldControls[field.key] = checkbox

            let checkboxContainer = NSView()
            checkbox.translatesAutoresizingMaskIntoConstraints = false
            checkboxContainer.addSubview(checkbox)
            NSLayoutConstraint.activate([
                checkbox.leadingAnchor.constraint(
                    equalTo: checkboxContainer.leadingAnchor
                ),
                checkbox.topAnchor.constraint(
                    equalTo: checkboxContainer.topAnchor
                ),
                checkboxContainer.heightAnchor.constraint(
                    greaterThanOrEqualTo: checkbox.heightAnchor
                )
            ])
            return fieldRow(
                label: field.label + (field.required ? " *" : ""),
                description: field.description,
                control: checkboxContainer
            )
        }

        if field.type == .secret {
            let secretField = RevealableSecureField()
            secretField.placeholderString = field.required ? "Required" : ""
            secretFieldControls[field.key] = secretField
            return fieldRow(
                label: field.label + (field.required ? " *" : ""),
                description: field.description,
                control: secretField
            )
        }

        let textField = NSTextField()
        textField.placeholderString = field.required ? "Required" : ""
        textField.setContentHuggingPriority(.defaultLow, for: .horizontal)
        fieldControls[field.key] = textField

        var valueViews: [NSView] = [textField]
        if field.type == .file || field.type == .directory {
            let browseButton = NSButton(
                title: "Choose…",
                target: self,
                action: #selector(choosePath(_:))
            )
            fieldsByBrowseButton[ObjectIdentifier(browseButton)] = field
            valueViews.append(browseButton)
        }
        let valueRow = NSStackView(views: valueViews)
        valueRow.orientation = .horizontal
        valueRow.alignment = .centerY
        valueRow.spacing = 8
        textField.widthAnchor.constraint(
            greaterThanOrEqualToConstant: 240
        ).isActive = true
        return fieldRow(
            label: field.label + (field.required ? " *" : ""),
            description: field.description,
            control: valueRow
        )
    }

    private func fieldRow(
        label: String,
        description: String?,
        control: NSView
    ) -> NSView {
        let labelView = NSTextField(labelWithString: label)
        labelView.font = .systemFont(ofSize: 13, weight: .medium)

        var informationViews: [NSView] = [labelView]
        if let description {
            let descriptionLabel = NSTextField(
                wrappingLabelWithString: description
            )
            descriptionLabel.textColor = .secondaryLabelColor
            descriptionLabel.font = .systemFont(ofSize: 11)
            descriptionLabel.maximumNumberOfLines = 2
            descriptionLabel.lineBreakMode = .byWordWrapping
            descriptionLabel.toolTip = description
            informationViews.append(descriptionLabel)
        }

        let informationStack = NSStackView(views: informationViews)
        informationStack.orientation = .vertical
        informationStack.alignment = .leading
        informationStack.spacing = 4
        informationStack.translatesAutoresizingMaskIntoConstraints = false

        control.setContentHuggingPriority(.defaultLow, for: .horizontal)
        let row = NSStackView(views: [informationStack, control])
        row.orientation = .horizontal
        row.alignment = .top
        row.spacing = 20
        row.distribution = .fill

        NSLayoutConstraint.activate([
            informationStack.widthAnchor.constraint(equalToConstant: 240),
            control.widthAnchor.constraint(greaterThanOrEqualToConstant: 280)
        ])
        return row
    }

    private func refresh() {
        recentOutputCheckbox.state =
            settings.includesRecentOutputInErrors ? .on : .off
        loadProjectConfiguration()
    }

    private func loadProjectConfiguration() {
        guard let userConfiguration else { return }
        do {
            let values = try DotEnvConfigurationStore(
                projectURL: projectURL,
                configuration: userConfiguration
            ).load()
            for field in userConfiguration.fields {
                setControlValue(
                    values[field.key, default: ""],
                    for: field
                )
            }
            projectStatusLabel.textColor = .secondaryLabelColor
            projectStatusLabel.stringValue = ""
            saveAndRestartButton?.isEnabled = true
        } catch {
            projectStatusLabel.textColor = .systemRed
            projectStatusLabel.stringValue = error.localizedDescription
            saveAndRestartButton?.isEnabled = false
        }
    }

    private func setControlValue(
        _ value: String,
        for field: EnmannerManifest.UserConfiguration.Field
    ) {
        if let checkbox = fieldControls[field.key] as? NSButton {
            checkbox.state = Self.booleanValue(value) ? .on : .off
        } else if let secretField = secretFieldControls[field.key] {
            secretField.stringValue = value
        } else if let textField = fieldControls[field.key] as? NSTextField {
            textField.stringValue = value
        }
    }

    private func controlValue(
        for field: EnmannerManifest.UserConfiguration.Field
    ) -> String {
        if let checkbox = fieldControls[field.key] as? NSButton {
            return checkbox.state == .on ? "true" : "false"
        }
        if let secretField = secretFieldControls[field.key] {
            return secretField.stringValue
        }
        return (fieldControls[field.key] as? NSTextField)?.stringValue ?? ""
    }

    private static func booleanValue(_ value: String) -> Bool {
        ["1", "true", "yes", "on"].contains(value.lowercased())
    }

    private func presentSaveError(_ error: Error) {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "Project configuration was not saved."
        alert.informativeText = error.localizedDescription
        if let window {
            alert.beginSheetModal(for: window)
        } else {
            alert.runModal()
        }
    }

    @objc private func settingChanged() {
        settings.includesRecentOutputInErrors =
            recentOutputCheckbox.state == .on
    }

    @objc private func choosePath(_ sender: NSButton) {
        guard let field = fieldsByBrowseButton[ObjectIdentifier(sender)],
              let textField = fieldControls[field.key] as? NSTextField else {
            return
        }
        let panel = NSOpenPanel()
        panel.canChooseFiles = field.type == .file
        panel.canChooseDirectories = field.type == .directory
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = field.type == .directory
        panel.directoryURL = URL(
            fileURLWithPath: textField.stringValue.isEmpty
                ? projectURL.path
                : textField.stringValue
        )
        guard panel.runModal() == .OK, let url = panel.url else { return }
        textField.stringValue = url.path
    }

    @objc private func saveProjectConfiguration() {
        guard let userConfiguration else { return }
        let values = Dictionary(
            uniqueKeysWithValues: userConfiguration.fields.map {
                ($0.key, controlValue(for: $0))
            }
        )
        do {
            try DotEnvConfigurationStore(
                projectURL: projectURL,
                configuration: userConfiguration
            ).save(values)
            projectStatusLabel.stringValue = ""
            window?.orderOut(nil)
            onSaveAndRestart?()
        } catch {
            presentSaveError(error)
        }
    }
}

private final class FlippedView: NSView {
    override var isFlipped: Bool { true }
}

private final class TrailingInsetSecureTextFieldCell: NSSecureTextFieldCell {
    private let trailingInset: CGFloat = 32

    override func drawingRect(forBounds rect: NSRect) -> NSRect {
        insetTextFrame(super.drawingRect(forBounds: rect))
    }

    override func edit(
        withFrame rect: NSRect,
        in controlView: NSView,
        editor textObject: NSText,
        delegate object: Any?,
        event: NSEvent?
    ) {
        super.edit(
            withFrame: insetTextFrame(rect),
            in: controlView,
            editor: textObject,
            delegate: object,
            event: event
        )
    }

    override func select(
        withFrame rect: NSRect,
        in controlView: NSView,
        editor textObject: NSText,
        delegate object: Any?,
        start: Int,
        length: Int
    ) {
        super.select(
            withFrame: insetTextFrame(rect),
            in: controlView,
            editor: textObject,
            delegate: object,
            start: start,
            length: length
        )
    }

    private func insetTextFrame(_ rect: NSRect) -> NSRect {
        var result = rect
        result.size.width = max(0, result.width - trailingInset)
        return result
    }
}

private final class TrailingInsetSecureTextField: NSSecureTextField {
    override class var cellClass: AnyClass? {
        get { TrailingInsetSecureTextFieldCell.self }
        set {}
    }
}

@MainActor
private final class RevealableSecureField: NSView, NSTextFieldDelegate {
    private let secureField = TrailingInsetSecureTextField()
    private let revealedField = NSTextField()
    private let revealButton = NSButton()
    private var isRevealed = false
    private var focusEventMonitor: Any?

    var stringValue: String {
        get {
            isRevealed
                ? revealedField.stringValue
                : secureField.stringValue
        }
        set {
            secureField.stringValue = newValue
            revealedField.stringValue = newValue
        }
    }

    var placeholderString: String? {
        get { secureField.placeholderString }
        set {
            secureField.placeholderString = newValue
            revealedField.placeholderString = newValue
        }
    }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)

        secureField.setContentHuggingPriority(.defaultLow, for: .horizontal)
        revealedField.setContentHuggingPriority(.defaultLow, for: .horizontal)
        revealedField.delegate = self
        revealedField.isHidden = true

        revealButton.image = NSImage(
            systemSymbolName: "eye",
            accessibilityDescription: "Show value"
        )
        revealButton.imagePosition = .imageOnly
        revealButton.isBordered = true
        revealButton.bezelStyle = .roundRect
        revealButton.controlSize = .small
        revealButton.contentTintColor = .secondaryLabelColor
        revealButton.toolTip = "Show value"
        revealButton.target = self
        revealButton.action = #selector(toggleVisibility)
        revealButton.setAccessibilityLabel("Show value")
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(windowDidResignKey(_:)),
            name: NSWindow.didResignKeyNotification,
            object: nil
        )

        secureField.translatesAutoresizingMaskIntoConstraints = false
        revealedField.translatesAutoresizingMaskIntoConstraints = false
        revealButton.translatesAutoresizingMaskIntoConstraints = false
        addSubview(secureField)
        addSubview(revealedField)
        addSubview(
            revealButton,
            positioned: .above,
            relativeTo: revealedField
        )

        NSLayoutConstraint.activate([
            secureField.leadingAnchor.constraint(
                equalTo: leadingAnchor
            ),
            secureField.trailingAnchor.constraint(
                equalTo: trailingAnchor
            ),
            secureField.topAnchor.constraint(
                equalTo: topAnchor
            ),
            secureField.bottomAnchor.constraint(
                equalTo: bottomAnchor
            ),
            revealedField.leadingAnchor.constraint(
                equalTo: leadingAnchor
            ),
            revealedField.trailingAnchor.constraint(
                equalTo: trailingAnchor
            ),
            revealedField.topAnchor.constraint(
                equalTo: topAnchor
            ),
            revealedField.bottomAnchor.constraint(
                equalTo: bottomAnchor
            ),
            widthAnchor.constraint(greaterThanOrEqualToConstant: 240),
            revealButton.trailingAnchor.constraint(
                equalTo: trailingAnchor,
                constant: -3
            ),
            revealButton.centerYAnchor.constraint(equalTo: centerYAnchor),
            revealButton.widthAnchor.constraint(equalToConstant: 24),
            revealButton.heightAnchor.constraint(equalToConstant: 20)
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        if let focusEventMonitor {
            NSEvent.removeMonitor(focusEventMonitor)
        }
    }

    @objc private func toggleVisibility() {
        guard !isRevealed else { return }
        revealedField.stringValue = secureField.stringValue
        isRevealed = true
        secureField.isHidden = true
        revealedField.isHidden = false
        revealButton.isHidden = true
        window?.makeFirstResponder(revealedField)
        installFocusMonitor()
    }

    func controlTextDidEndEditing(_ notification: Notification) {
        guard notification.object as? NSTextField === revealedField else {
            return
        }
        remask()
    }

    @objc private func windowDidResignKey(_ notification: Notification) {
        guard notification.object as? NSWindow === window else { return }
        remask()
    }

    private func installFocusMonitor() {
        guard focusEventMonitor == nil else { return }
        focusEventMonitor = NSEvent.addLocalMonitorForEvents(
            matching: [.leftMouseDown, .rightMouseDown, .keyDown]
        ) { [weak self] event in
            guard let self, self.isRevealed else { return event }
            switch event.type {
            case .leftMouseDown, .rightMouseDown:
                if event.window === self.window {
                    let localPoint = self.convert(
                        event.locationInWindow,
                        from: nil
                    )
                    if !self.bounds.contains(localPoint) {
                        self.remask()
                    }
                } else {
                    self.remask()
                }
            case .keyDown where [36, 48, 53].contains(event.keyCode):
                DispatchQueue.main.async { [weak self] in
                    self?.remask()
                }
            default:
                break
            }
            return event
        }
    }

    private func remask() {
        guard isRevealed else { return }
        secureField.stringValue = revealedField.stringValue
        isRevealed = false
        secureField.isHidden = false
        revealedField.isHidden = true
        revealButton.isHidden = false
        if let focusEventMonitor {
            NSEvent.removeMonitor(focusEventMonitor)
            self.focusEventMonitor = nil
        }
    }
}
