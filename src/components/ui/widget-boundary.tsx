"use client";

import { Component, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

// Per-widget error isolation: a failing card degrades alone instead of taking
// the whole page to the route error boundary. Client boundaries catch errors
// thrown by streamed server-component children too.
export class WidgetBoundary extends Component<
  { children: ReactNode; label?: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {this.props.label ?? "This panel"} couldn&apos;t load — refresh to retry.
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}
