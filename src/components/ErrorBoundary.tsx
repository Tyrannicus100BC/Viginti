import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: "2rem",
                    backgroundColor: "#2a0000",
                    color: "#ffcccc",
                    height: "100vh",
                    overflow: "auto",
                    fontFamily: "monospace"
                }}>
                    <h1>Something went wrong.</h1>
                    <h2 style={{ color: "#ff4444" }}>{this.state.error && this.state.error.toString()}</h2>
                    <details style={{ whiteSpace: "pre-wrap", marginTop: "1rem" }}>
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </details>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: "2rem",
                            padding: "10px 20px",
                            fontSize: "1.2rem",
                            cursor: "pointer"
                        }}
                    >
                        Reload Page
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
