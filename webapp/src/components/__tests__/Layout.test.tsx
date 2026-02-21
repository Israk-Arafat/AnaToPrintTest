import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Layout from "../Layout";

describe("Layout", () => {
  it("renders header, nav tabs, and children", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Layout>
          <div>Page Body Content</div>
        </Layout>
      </MemoryRouter>,
    );

    expect(screen.getByText("AnaToPrint")).toBeInTheDocument();
    expect(screen.getByText("Upload")).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Export")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("About")).toBeInTheDocument();
    expect(screen.getByText("Page Body Content")).toBeInTheDocument();
  });

  it("marks the current route tab as active", () => {
    render(
      <MemoryRouter initialEntries={["/export"]}>
        <Layout>
          <div>Export Body</div>
        </Layout>
      </MemoryRouter>,
    );

    const exportLink = screen.getByRole("link", { name: "Export" });
    const uploadLink = screen.getByRole("link", { name: "Upload" });

    expect(exportLink.className).toContain("border-blue-500");
    expect(exportLink.className).toContain("text-blue-600");
    expect(uploadLink.className).toContain("border-transparent");
  });
});
