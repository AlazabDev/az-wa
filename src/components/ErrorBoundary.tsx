import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI crash", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center">
        <div className="max-w-md space-y-4">
          <h1 className="text-lg font-semibold">حدث خطأ غير متوقع</h1>
          <p className="text-sm text-muted-foreground break-words">{this.state.error.message}</p>
          <div className="flex justify-center gap-2">
            <Button onClick={() => this.setState({ error: null })} variant="outline">إعادة المحاولة</Button>
            <Button onClick={() => window.location.assign("/")}>العودة للرئيسية</Button>
          </div>
        </div>
      </div>
    );
  }
}
