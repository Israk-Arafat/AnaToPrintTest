import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AboutPage from "../AboutPage";

// Tests

describe("AboutPage", () => {
  it("renders the application title", () => {
    render(<AboutPage />);
    expect(
      screen.getByRole("heading", { name: /AnaToPrint/i, level: 2 }),
    ).toBeInTheDocument();
  });

  it("renders the university attribution", () => {
    render(<AboutPage />);
    expect(
      screen.getByText(/University of Maine - Capstone Project/i),
    ).toBeInTheDocument();
  });

  it("renders the Group Members section heading", () => {
    render(<AboutPage />);
    expect(
      screen.getByRole("heading", { name: /Group Members/i }),
    ).toBeInTheDocument();
  });

  it("lists all five team members", () => {
    render(<AboutPage />);
    expect(screen.getByText(/Israk Arafat/i)).toBeInTheDocument();
    expect(screen.getByText(/Gregory Michaud/i)).toBeInTheDocument();
    expect(screen.getByText(/Cooper Stepankiw/i)).toBeInTheDocument();
    expect(screen.getByText(/Bryan Sturdivant/i)).toBeInTheDocument();
    expect(screen.getByText(/Ethan Wyman/i)).toBeInTheDocument();
  });

  it("renders the Client section with Terry Yoo", () => {
    render(<AboutPage />);
    expect(
      screen.getByRole("heading", { name: /Client/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Terry Yoo/i)).toBeInTheDocument();
  });

  it("renders the Project Title section", () => {
    render(<AboutPage />);
    expect(
      screen.getByRole("heading", { name: /Project Title/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/AnaToPrint: Medical CT 3D Printing/i),
    ).toBeInTheDocument();
  });

  it("renders the Importance section", () => {
    render(<AboutPage />);
    expect(
      screen.getByRole("heading", { name: /Importance/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/clinicians/i)).toBeInTheDocument();
  });

  it("renders the Versions section with version 1.0", () => {
    render(<AboutPage />);
    expect(
      screen.getByRole("heading", { name: /Versions/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/1\.0/i)).toBeInTheDocument();
  });
});
