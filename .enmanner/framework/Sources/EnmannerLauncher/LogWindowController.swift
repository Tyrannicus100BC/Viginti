import AppKit
import EnmannerCore

@MainActor
final class LogWindowController: NSWindowController {
    private let textView = NSTextView()
    private let entryCountLabel = NSTextField(labelWithString: "")
    private let filterPopUp = NSPopUpButton()
    private let restartButton = NSButton(
        title: "Restart Component",
        target: nil,
        action: nil
    )
    private var currentLogs = ""
    private(set) var filterKey = "all"
    var onFilterChange: ((String) -> Void)?
    var onRestartComponent: ((String) -> Void)?

    init(appName: String, componentNames: [String]) {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 760, height: 480),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "\(appName) Runtime Logs"
        window.minSize = NSSize(width: 520, height: 320)
        window.isReleasedWhenClosed = false
        window.setFrameAutosaveName("EnmannerServerLogWindow")
        super.init(window: window)

        configureViews(componentNames: componentNames)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func showWindow(_ sender: Any?) {
        super.showWindow(sender)
        window?.makeKeyAndOrderFront(sender)
    }

    func updateLogs(_ text: String) {
        currentLogs = text
        textView.string = text

        let entryCount = text.isEmpty ? 0 : text.split(separator: "\n").count
        entryCountLabel.stringValue =
            "\(entryCount) of the most recent 500 entries"

        if !text.isEmpty {
            textView.scrollToEndOfDocument(nil)
        }
    }

    private func configureViews(componentNames: [String]) {
        guard let window else { return }

        let contentView = NSView()
        window.contentView = contentView

        let scrollView = NSScrollView()
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.documentView = textView
        scrollView.hasVerticalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.borderType = .bezelBorder

        let contentSize = scrollView.contentSize
        textView.frame = NSRect(origin: .zero, size: contentSize)
        textView.minSize = NSSize(width: 0, height: contentSize.height)
        textView.maxSize = NSSize(
            width: CGFloat.greatestFiniteMagnitude,
            height: CGFloat.greatestFiniteMagnitude
        )
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [.width]
        textView.isEditable = false
        textView.isSelectable = true
        textView.isRichText = false
        textView.usesFindBar = true
        textView.isIncrementalSearchingEnabled = true
        textView.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        textView.textColor = .textColor
        textView.backgroundColor = .textBackgroundColor
        textView.textContainerInset = NSSize(width: 12, height: 12)
        textView.textContainer?.widthTracksTextView = true
        textView.textContainer?.containerSize = NSSize(
            width: contentSize.width,
            height: CGFloat.greatestFiniteMagnitude
        )

        entryCountLabel.translatesAutoresizingMaskIntoConstraints = false
        entryCountLabel.textColor = .secondaryLabelColor
        entryCountLabel.font = .systemFont(ofSize: 11)

        filterPopUp.translatesAutoresizingMaskIntoConstraints = false
        filterPopUp.addItem(withTitle: "All Components")
        filterPopUp.lastItem?.representedObject = "all"
        filterPopUp.addItem(withTitle: "Enmanner")
        filterPopUp.lastItem?.representedObject = "enmanner"
        for component in componentNames.sorted() {
            filterPopUp.addItem(
                withTitle: component == RuntimeGraph.inlineApplicationComponent
                    ? "Application"
                    : component
            )
            filterPopUp.lastItem?.representedObject = component
        }
        filterPopUp.target = self
        filterPopUp.action = #selector(changeFilter)

        restartButton.translatesAutoresizingMaskIntoConstraints = false
        restartButton.target = self
        restartButton.action = #selector(restartSelectedComponent)
        restartButton.isEnabled = false

        let copyButton = NSButton(
            title: "Copy All",
            target: self,
            action: #selector(copyAll)
        )
        copyButton.translatesAutoresizingMaskIntoConstraints = false

        contentView.addSubview(scrollView)
        contentView.addSubview(entryCountLabel)
        contentView.addSubview(filterPopUp)
        contentView.addSubview(restartButton)
        contentView.addSubview(copyButton)

        NSLayoutConstraint.activate([
            scrollView.leadingAnchor.constraint(
                equalTo: contentView.leadingAnchor,
                constant: 16
            ),
            scrollView.trailingAnchor.constraint(
                equalTo: contentView.trailingAnchor,
                constant: -16
            ),
            scrollView.topAnchor.constraint(
                equalTo: contentView.topAnchor,
                constant: 16
            ),
            scrollView.bottomAnchor.constraint(
                equalTo: entryCountLabel.topAnchor,
                constant: -12
            ),

            entryCountLabel.leadingAnchor.constraint(
                equalTo: scrollView.leadingAnchor
            ),
            entryCountLabel.centerYAnchor.constraint(
                equalTo: copyButton.centerYAnchor
            ),
            entryCountLabel.bottomAnchor.constraint(
                equalTo: contentView.bottomAnchor,
                constant: -16
            ),

            filterPopUp.trailingAnchor.constraint(
                equalTo: contentView.centerXAnchor,
                constant: -4
            ),
            filterPopUp.centerYAnchor.constraint(equalTo: copyButton.centerYAnchor),

            restartButton.leadingAnchor.constraint(
                equalTo: contentView.centerXAnchor,
                constant: 4
            ),
            restartButton.centerYAnchor.constraint(equalTo: copyButton.centerYAnchor),

            copyButton.trailingAnchor.constraint(
                equalTo: scrollView.trailingAnchor
            )
        ])

        updateLogs("")
    }

    @objc private func copyAll() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(currentLogs, forType: .string)
    }

    @objc private func changeFilter() {
        filterKey = filterPopUp.selectedItem?.representedObject as? String ?? "all"
        restartButton.isEnabled = filterKey != "all" && filterKey != "enmanner"
        onFilterChange?(filterKey)
    }

    @objc private func restartSelectedComponent() {
        guard filterKey != "all", filterKey != "enmanner" else { return }
        onRestartComponent?(filterKey)
    }
}
