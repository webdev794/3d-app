import { NavLink } from 'react-router-dom';
import { FolderOpen, ImageUp, Layers3, ShieldCheck } from 'lucide-react';
import NavMenu, { type NavMenuItem } from './NavMenu';
import '../../css/projects-tabs.css';

/* Cyan line icons drawn like the ORDERS menu's (stroke 1.6): a folder (as on the Dashboard), the picture with an
   arrow of the Convert page, the shield of a project card's Approve button, and the layers of Assets. */
const line = { strokeWidth: 1.6, 'aria-hidden': true } as const;
const ProjectsIcon = () => <FolderOpen {...line} />;
const ConvertIcon = () => <ImageUp {...line} />;
const ApprovedIcon = () => <ShieldCheck {...line} />;
const AssetsIcon = () => <Layers3 {...line} />;

/**
 * Projects, Convert, Approved and Assets are one place (client 2026-10-26: "condensed to one page or one menu
 * dropdown", then "place the Convert menu in the dropdown under Projects"): the header's PROJECTS menu lists them,
 * and their pages share a tab row (ProjectsTabs). `tab`: the tab's name.
 */
export const PROJECT_SECTIONS: (NavMenuItem & { tab: string })[] = [
  { to: '/projects', tab: 'Projects', title: 'My projects', text: 'Your saved kits and their versions', Icon: ProjectsIcon },
  { to: '/convert', tab: 'Convert', title: 'Convert', text: 'Instant 3D from your artwork', Icon: ConvertIcon },
  { to: '/approved', tab: 'Approved', title: 'Approved', text: 'Your final, approved designs', Icon: ApprovedIcon },
  { to: '/assets', tab: 'Assets', title: 'Assets', text: 'Your logos, artwork and patterns', Icon: AssetsIcon },
];

const isActive = (pathname: string) => PROJECT_SECTIONS.some(({ to }) => pathname === to || pathname.startsWith(`${to}/`));

/**
 * "Projects" in the site header with its menu (NavMenu.tsx, built like ORDERS): My projects, Convert, Approved and
 * Assets. The word opens My projects (/projects); hovering it or its small chevron opens the dropdown. Folded header
 * (tablets and phones): Projects is a row of the header menu with the four links listed under it.
 */
export default function ProjectsMenu({ onNavigate }: { onNavigate?: () => void }) {
  return <NavMenu kind="projects" label="Projects" page="/projects" items={PROJECT_SECTIONS} isActive={isActive} onNavigate={onNavigate} />;
}

/**
 * Projects · Convert · Approved · Assets at the top of those pages, the current one lit (projects-tabs.css): the
 * Library pages put it first in their page; `shell` puts it in a page-shell of its own above a page (Convert, App.tsx).
 */
export function ProjectsTabs({ shell = false }: { shell?: boolean }) {
  const tabs = <nav className="lib-sections" aria-label="Projects sections">
    {PROJECT_SECTIONS.map(({ to, tab, Icon }) => <NavLink key={to} to={to} end><Icon /><span>{tab}</span></NavLink>)}
  </nav>;
  return shell ? <div className="page-shell lib-sections-shell">{tabs}</div> : tabs;
}
