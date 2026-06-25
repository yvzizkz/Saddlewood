"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ChevronDown } from "lucide-react";

const navLinks = [
  { label: "Work", href: "/portfolio" },
  {
    label: "Services",
    href: "#",
    children: [
      { label: "All Services", href: "/services" },
      { label: "New Construction", href: "/new-construction" },
      { label: "Framing", href: "/framing" },
    ],
  },
  {
    label: "Areas",
    href: "#",
    children: [
      { label: "McCormick Ranch", href: "/neighborhoods/mccormick-ranch" },
      { label: "Gainey Ranch", href: "/neighborhoods/gainey-ranch" },
      { label: "Arcadia", href: "/neighborhoods/arcadia" },
      { label: "Paradise Valley", href: "/neighborhoods/paradise-valley" },
      { label: "Silverleaf", href: "/neighborhoods/silverleaf" },
      { label: "DC Ranch", href: "/neighborhoods/dc-ranch" },
      { label: "Grayhawk", href: "/neighborhoods/grayhawk" },
      { label: "Pinnacle Peak", href: "/neighborhoods/pinnacle-peak" },
    ],
  },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpenStates, setMenuOpenStates] = useState<Record<string, boolean>>({});
  const [menuActiveIndices, setMenuActiveIndices] = useState<Record<string, number>>({});

  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const menuItemsRefs = useRef<Record<string, (HTMLAnchorElement | null)[]>>({});
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);

  const openMenu = useCallback((label: string) => {
    setMenuOpenStates(() => {
      const next = {} as Record<string, boolean>;
      next[label] = true;
      return next;
    });
    setMenuActiveIndices((prev) => ({
      ...prev,
      [label]: -1,
    }));
  }, []);

  const closeMenu = useCallback((label: string) => {
    setMenuOpenStates((prev) => ({
      ...prev,
      [label]: false,
    }));
    setMenuActiveIndices((prev) => ({
      ...prev,
      [label]: -1,
    }));
  }, []);

  const setMenuIndex = useCallback((label: string, index: number) => {
    setMenuActiveIndices((prev) => ({
      ...prev,
      [label]: index,
    }));
  }, []);

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
    (e: React.KeyboardEvent, label: string) => {
      const link = navLinks.find((l) => l.label === label);
      if (!link?.children) return;
      const itemCount = link.children.length;
      const isOpen = !!menuOpenStates[label];
      const activeIdx = menuActiveIndices[label] ?? -1;

      switch (e.key) {
        case "Enter":
        case " ":
          e.preventDefault();
          if (!isOpen) {
            openMenu(label);
            setMenuIndex(label, 0);
          }
          break;
        case "ArrowDown":
          e.preventDefault();
          if (!isOpen) {
            openMenu(label);
            setMenuIndex(label, 0);
          } else {
            setMenuIndex(label, (activeIdx + 1) % itemCount);
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (isOpen) {
            setMenuIndex(label, (activeIdx - 1 + itemCount) % itemCount);
          }
          break;
        case "Escape":
          e.preventDefault();
          closeMenu(label);
          break;
        case "Tab":
          if (isOpen) {
            closeMenu(label);
          }
          break;
      }
    },
    [menuOpenStates, menuActiveIndices, openMenu, closeMenu, setMenuIndex]
  );

  // Focus menu items when activeMenuIndex changes
  useEffect(() => {
    const openMenuLabel = Object.keys(menuOpenStates).find((k) => menuOpenStates[k]);
    if (openMenuLabel) {
      const activeIndex = menuActiveIndices[openMenuLabel];
      if (activeIndex !== undefined && activeIndex >= 0) {
        const items = menuItemsRefs.current[openMenuLabel];
        if (items && items[activeIndex]) {
          items[activeIndex]?.focus();
        }
      }
    }
  }, [menuOpenStates, menuActiveIndices]);

  // Handle keydown within dropdown menu items
  const handleMenuItemKeyDown = useCallback(
    (e: React.KeyboardEvent, label: string, index: number) => {
      const link = navLinks.find((l) => l.label === label);
      if (!link?.children) return;
      const itemCount = link.children.length;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setMenuIndex(label, (index + 1) % itemCount);
          break;
        case "ArrowUp":
          e.preventDefault();
          setMenuIndex(label, (index - 1 + itemCount) % itemCount);
          break;
        case "Escape":
          e.preventDefault();
          closeMenu(label);
          // Return focus to the dropdown trigger
          dropdownRefs.current[label]?.querySelector("button")?.focus();
          break;
        case "Tab":
          closeMenu(label);
          break;
      }
    },
    [closeMenu, setMenuIndex]
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
            ? "h-[80px] bg-[rgba(26,47,47,0.97)] backdrop-blur-xl shadow-[0_1px_0_rgba(255,255,255,0.06)]"
            : "h-[88px] bg-gradient-to-b from-[rgba(26,47,47,0.85)] via-[rgba(26,47,47,0.5)] to-transparent"
        }`}
      >
        {/* Brand with Logo */}
        <Link href="/" className="flex items-center gap-3 no-underline shrink-0" aria-label="Saddlewood Contracting — home">
          <div className="relative w-[60px] h-[60px] sm:w-[68px] sm:h-[68px] shrink-0">
            <Image
              src="/images/logo.png"
              alt="Saddlewood Contracting LLC"
              fill
              className="object-contain"
              priority
            />
          </div>
          <span className="hidden sm:block text-white text-[15px] font-heading tracking-[0.04em] leading-tight uppercase">
            Saddlewood<br />Contracting
          </span>
        </Link>

        {/* Desktop Nav Links */}
        <div className="hidden lg:flex items-center gap-5 xl:gap-8">
          {navLinks.map((link) =>
            link.children ? (
              <div
                key={link.label}
                className="relative"
                ref={(el) => { dropdownRefs.current[link.label] = el; }}
                onMouseEnter={() => openMenu(link.label)}
                onMouseLeave={() => {
                  closeMenu(link.label);
                }}
              >
                <button
                  className="flex items-center gap-1.5 text-[15px] xl:text-base font-normal text-white/80 hover:text-white transition-colors tracking-wide bg-transparent border-none cursor-pointer"
                  aria-expanded={!!menuOpenStates[link.label]}
                  aria-haspopup="true"
                  onKeyDown={(e) => handleDropdownKeyDown(e, link.label)}
                  onFocus={() => openMenu(link.label)}
                  onBlur={(e) => {
                    // Close if focus moves outside the dropdown container
                    if (!dropdownRefs.current[link.label]?.contains(e.relatedTarget as Node)) {
                      closeMenu(link.label);
                    }
                  }}
                >
                  {link.label}
                  <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <AnimatePresence>
                  {!!menuOpenStates[link.label] && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 mt-2 min-w-[220px] bg-[rgba(26,47,47,0.95)] backdrop-blur-xl border border-white/[0.06] py-2 rounded-sm"
                      role="menu"
                      aria-label={`${link.label} submenu`}
                    >
                      {link.children.map((child, idx) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          ref={(el) => {
                            if (!menuItemsRefs.current[link.label]) {
                              menuItemsRefs.current[link.label] = [];
                            }
                            menuItemsRefs.current[link.label][idx] = el;
                          }}
                          className={`block px-5 py-3 text-[15px] text-white/70 hover:text-gold hover:bg-white/[0.03] transition-colors no-underline ${
                            idx === (menuActiveIndices[link.label] ?? -1) ? "text-gold bg-white/[0.03]" : ""
                          }`}
                          role="menuitem"
                          tabIndex={-1}
                          onKeyDown={(e) => handleMenuItemKeyDown(e, link.label, idx)}
                          onBlur={(e) => {
                            if (!dropdownRefs.current[link.label]?.contains(e.relatedTarget as Node)) {
                              closeMenu(link.label);
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
            className="fixed inset-0 z-40 bg-[rgba(26,47,47,0.98)] pt-24 px-6 overflow-y-auto"
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
