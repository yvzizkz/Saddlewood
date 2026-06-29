"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { projects } from "@/data/projects";

export function ProjectGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 auto-rows-[18rem] sm:auto-rows-[20rem] lg:auto-rows-[22rem]">
      {projects.map((project, index) => (
        <motion.div
          key={project.slug}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: Math.min(index * 0.02, 0.2) }}
          className={project.tall ? "sm:row-span-2" : ""}
        >
          <Link
            href={`/portfolio/${project.slug}`}
            className="group relative block w-full h-full overflow-hidden bg-stone"
          >
            <Image
              src={project.heroImage}
              alt={project.caption || project.title}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.02]"
            />
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
