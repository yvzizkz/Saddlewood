"use client";

import { useState, useEffect } from "react";
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
            : "h-[88px] bg-transparent"
        }`}
      >
        {/* Brand with Logo — larger, no clipping */}
        <Link href="/" className="flex items-center gap-3 no-underline shrink-0" aria-label="Saddlewood Contracting home">
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
            <span className="font-heading text-lg sm:text-xl font-semibold text-white leading-none tracking-wide">
              Saddlewood
            </span>
            <span className="font-sans text-[9px] sm:text-[10px] tracking-[0.35em] uppercase text-gold font-medium mt-[2px]">
              Contracting
            </span>
          </div>
        </Link>

        {/* Desktop Nav Links — larger, more readable font */}
        <div className="hidden lg:flex items-center gap-8 xl:gap-10">
          {navLinks.map((link) =>
            link.children ? (
              <div
                key={link.label}
                className="relative"
                onMouseEnter={() => setHoodOpen(true)}
                onMouseLeave={() => setHoodOpen(false)}
              >
                <button
                  className="flex items-center gap-1.5 text-[15px] xl:text-base font-normal text-white/80 hover:text-white transition-colors tracking-wide bg-transparent border-none cursor-pointer"
                  aria-expanded={hoodOpen}
                  aria-haspopup="true"
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
                    >
                      {link.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className="block px-5 py-3 text-[15px] text-white/70 hover:text-gold hover:bg-white/[0.03] transition-colors no-underline"
                          role="menuitem"
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
