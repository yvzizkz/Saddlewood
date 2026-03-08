"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ChevronDown } from "lucide-react";

const navLinks = [
  { label: "Work", href: "/portfolio" },
  { label: "Services", href: "/services" },
  {
    label: "Neighborhoods",
    href: "#",
    children: [
      { label: "McCormick Ranch", href: "/neighborhoods/mccormick-ranch" },
      { label: "Gainey Ranch", href: "/neighborhoods/gainey-ranch" },
      { label: "Pinnacle Peak", href: "/neighborhoods/pinnacle-peak" },
    ],
  },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hoodOpen, setHoodOpen] = useState(false);
  const [activeMenuIndex, setActiveMenuIndex] = useState(-1);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuItemsRef = useRef<(HTMLAnchorElement | null)[]>([]);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Focus trap for mobile menu
  useEffect(() => {
    if (!mobileOpen || !mobileMenuRef.current) return;

    const menu = mobileMenuRef.current;
    const focusableSelector = 'a[href], button, [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        mobileToggleRef.current?.focus();
        return;
      }

      if (e.key !== "Tab") return;

      const focusableElements = menu.querySelectorAll<HTMLElement>(focusableSelector);
      // Include the mobile toggle button in the focus trap
      const allFocusable = [mobileToggleRef.current!, ...Array.from(focusableElements)].filter(Boolean);
      if (allFocusable.length === 0) return;

      const firstEl = allFocusable[0];
      const lastEl = allFocusable[allFocusable.length - 1];

      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    // Move focus into the mobile menu on open
    const firstLink = menu.querySelector<HTMLElement>(focusableSelector);
    firstLink?.focus();

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  // Keyboard navigation for dropdown menu
  const handleDropdownKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const neighborhoodLink = navLinks.find((l) => l.children);
      if (!neighborhoodLink?.children) return;
      const itemCount = neighborhoodLink.children.length;

      switch (e.key) {
        case "Enter":
        case " ":
          e.preventDefault();
          if (!hoodOpen) {
            setHoodOpen(true);
            setActiveMenuIndex(0);
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (!hoodOpen) {
            setHoodOpen(true);
            setActiveMenuIndex(0);
          } else {
            setActiveMenuIndex((prev) => (prev + 1) % itemCount);
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (hoodOpen) {
            setActiveMenuIndex((prev) => (prev - 1 + itemCount) % itemCount);
          }
          break;
        case "Escape":
          e.preventDefault();
          setHoodOpen(false);
          setActiveMenuIndex(-1);
          break;
        case "Tab":
          if (hoodOpen) {
            setHoodOpen(false);
            setActiveMenuIndex(-1);
          }
          break;
      }
    },
    [hoodOpen]
  );

  // Focus menu items when activeMenuIndex changes
  useEffect(() => {
    if (activeMenuIndex >= 0 && menuItemsRef.current[activeMenuIndex]) {
      menuItemsRef.current[activeMenuIndex]?.focus();
    }
  }, [activeMenuIndex]);

  // Handle keydown within dropdown menu items
  const handleMenuItemKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      const neighborhoodLink = navLinks.find((l) => l.children);
      if (!neighborhoodLink?.children) return;
      const itemCount = neighborhoodLink.children.length;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveMenuIndex((index + 1) % itemCount);
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveMenuIndex((index - 1 + itemCount) % itemCount);
          break;
        case "Escape":
          e.preventDefault();
          setHoodOpen(false);
          setActiveMenuIndex(-1);
          // Return focus to the dropdown trigger
          dropdownRef.current?.querySelector("button")?.focus();
          break;
        case "Tab":
          setHoodOpen(false);
          setActiveMenuIndex(-1);
          break;
      }
    },
    []
  );

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:px-4 focus:py-2 focus:bg-gold focus:text-teal-dark focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      <nav
        role="navigation"
        aria-label="Main navigation"
        className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-6 lg:px-10 transition-all duration-400 ${
          scrolled
            ? "h-[80px] bg-[rgba(15,37,48,0.97)] backdrop-blur-xl shadow-[0_1px_0_rgba(255,255,255,0.06)]"
            : "h-[88px] bg-gradient-to-b from-[rgba(15,37,48,0.85)] via-[rgba(15,37,48,0.5)] to-transparent"
        }`}
      >
        {/* Brand with Logo */}
        <Link href="/" className="flex items-center gap-3 no-underline shrink-0" aria-label="Saddlewood Contracting — home">
          <div className="relative w-[64px] h-[64px] sm:w-[72px] sm:h-[72px] shrink-0">
            <Image
              src="/images/logo.svg"
              alt=""
              fill
              className="object-contain"
              priority
            />
          </div>
          <div className="flex flex-col">
            <span className="font-heading text-lg sm:text-xl font-semibold text-white leading-none tracking-wide" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7), 0 0px 8px rgba(0,0,0,0.4)' }}>
              Saddlewood
            </span>
            <span className="font-sans text-[10px] sm:text-[11px] tracking-[0.35em] uppercase text-gold font-semibold mt-[2px]" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0px 6px rgba(0,0,0,0.5)' }}>
              Contracting
            </span>
          </div>
        </Link>

        {/* Desktop Nav Links */}
        <div className="hidden lg:flex items-center gap-8 xl:gap-10">
          {navLinks.map((link) =>
            link.children ? (
              <div
                key={link.label}
                className="relative"
                ref={dropdownRef}
                onMouseEnter={() => setHoodOpen(true)}
                onMouseLeave={() => {
                  setHoodOpen(false);
                  setActiveMenuIndex(-1);
                }}
              >
                <button
                  className="flex items-center gap-1.5 text-[15px] xl:text-base font-normal text-white/80 hover:text-white transition-colors tracking-wide bg-transparent border-none cursor-pointer"
                  aria-expanded={hoodOpen}
                  aria-haspopup="true"
                  onKeyDown={handleDropdownKeyDown}
                  onFocus={() => setHoodOpen(true)}
                  onBlur={(e) => {
                    // Close if focus moves outside the dropdown container
                    if (!dropdownRef.current?.contains(e.relatedTarget as Node)) {
                      setHoodOpen(false);
                      setActiveMenuIndex(-1);
                    }
                  }}
                >
                  {link.label}
                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <AnimatePresence>
                  {hoodOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 mt-2 min-w-[220px] bg-[rgba(15,37,48,0.95)] backdrop-blur-xl border border-white/[0.06] py-2 rounded-sm"
                      role="menu"
                      aria-label="Neighborhoods submenu"
                    >
                      {link.children.map((child, idx) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          ref={(el) => { menuItemsRef.current[idx] = el; }}
                          className={`block px-5 py-3 text-[15px] text-white/70 hover:text-gold hover:bg-white/[0.03] transition-colors no-underline ${
                            idx === activeMenuIndex ? "text-gold bg-white/[0.03]" : ""
                          }`}
                          role="menuitem"
                          tabIndex={-1}
                          onKeyDown={(e) => handleMenuItemKeyDown(e, idx)}
                          onBlur={(e) => {
                            if (!dropdownRef.current?.contains(e.relatedTarget as Node)) {
                              setHoodOpen(false);
                              setActiveMenuIndex(-1);
                            }
                          }}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className="text-[15px] xl:text-base font-normal text-white/80 hover:text-white transition-colors tracking-wide no-underline"
              >
                {link.label}
              </Link>
            )
          )}
        </div>

        {/* CTA + Mobile Toggle */}
        <div className="flex items-center gap-4">
          <Link
            href="/contact"
            className="hidden lg:inline-block text-[13px] font-medium tracking-[0.08em] uppercase text-teal-dark bg-gold px-6 py-3 hover:bg-gold-muted transition-colors no-underline"
          >
            Book Consultation
          </Link>
          <button
            ref={mobileToggleRef}
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden text-white bg-transparent border-none p-2 cursor-pointer"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            ref={mobileMenuRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-[rgba(15,37,48,0.98)] pt-24 px-6 overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation menu"
          >
            <nav className="flex flex-col gap-1" aria-label="Mobile navigation">
              {navLinks.map((link) =>
                link.children ? (
                  <div key={link.label}>
                    <div className="py-4 border-b border-white/[0.06]">
                      <span className="text-xs tracking-[0.2em] uppercase text-gold/60 font-medium">
                        {link.label}
                      </span>
                    </div>
                    {link.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => setMobileOpen(false)}
                        className="block py-3.5 pl-4 text-lg text-white/70 hover:text-gold transition-colors no-underline"
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="block py-4 border-b border-white/[0.06] font-heading text-2xl text-white/80 hover:text-gold transition-colors no-underline"
                  >
                    {link.label}
                  </Link>
                )
              )}
              <Link
                href="/contact"
                onClick={() => setMobileOpen(false)}
                className="mt-8 block text-center text-sm font-medium tracking-[0.08em] uppercase text-teal-dark bg-gold px-6 py-4 no-underline"
              >
                Book Consultation
              </Link>
              <a
                href="tel:4809996100"
                className="mt-3 block text-center text-base text-white/60 no-underline"
              >
                (480) 999-6100
              </a>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
