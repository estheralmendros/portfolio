import { describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fixture } from './fixtures';
import { HeroSection } from '../../src/components/HeroSection';
import { ProjectCard } from '../../src/components/ProjectCard';
import { ProjectsSection } from '../../src/components/ProjectsSection';
import { ProjectDetail } from '../../src/components/ProjectDetail';
import { SkillChip } from '../../src/components/SkillChip';
import { SkillsSection } from '../../src/components/SkillsSection';
import { CertificationCard } from '../../src/components/CertificationCard';
import { CertificationsSection } from '../../src/components/CertificationsSection';
import { TimelineItem } from '../../src/components/TimelineItem';
import { TimelineSection } from '../../src/components/TimelineSection';
import { ContactSection } from '../../src/components/ContactSection';
import { Tag, TagList } from '../../src/components/Tag';
import { ProjectFilter } from '../../src/components/ProjectFilter';
import type { Project } from '../../src/content/schema';

const [alpha, admin, gamma] = fixture.projects as [Project, Project, Project];

describe('HeroSection', () => {
  it('renders profile data from props', () => {
    render(<HeroSection profile={fixture.profile} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Fixture Person' })).toBeInTheDocument();
    expect(screen.getByText(/Fixture Engineer/)).toBeInTheDocument();
    expect(screen.getByText(/Fixture City/)).toBeInTheDocument();
    expect(screen.getByText('Available for freelance')).toBeInTheDocument();
    expect(screen.getByText('Fixture bio paragraph one for end-to-end tests.')).toBeInTheDocument();
    expect(screen.getByText('Fixture bio paragraph two.')).toBeInTheDocument();
  });
  it('changing a value changes the output', () => {
    render(<HeroSection profile={{ ...fixture.profile, name: 'Someone Else', availability: 'not-looking' }} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Someone Else' })).toBeInTheDocument();
    expect(screen.getByText('Not looking')).toBeInTheDocument();
  });
  it('shows Download CV only with cvUrl, prefixed with the base', () => {
    const { unmount } = render(<HeroSection profile={fixture.profile} />);
    expect(screen.getByRole('link', { name: /Download CV/ })).toHaveAttribute('href', '/portfolio/docs/fixture-cv.pdf');
    unmount();
    render(<HeroSection profile={{ ...fixture.profile, cvUrl: '/uploads/cv.pdf?v=a1b2c3' }} />);
    const cv = screen.getByRole('link', { name: /Download CV/ });
    expect(cv).toHaveAttribute('href', '/portfolio/uploads/cv.pdf?v=a1b2c3');
    expect(cv).toHaveAttribute('download');
    cleanup();
    const { cvUrl: _cv, ...noCv } = fixture.profile;
    render(<HeroSection profile={noCv} />);
    expect(screen.queryByRole('link', { name: /Download CV/ })).toBeNull();
  });
  it('shows a photo when given, initials otherwise', () => {
    const { container, unmount } = render(<HeroSection profile={fixture.profile} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('FP')).toBeInTheDocument();
    unmount();
    render(<HeroSection profile={fixture.profile} photo={{ src: '/portfolio/images/me.jpg' }} />);
    expect(screen.getByRole('img', { name: 'Fixture Person' })).toHaveAttribute('src', '/portfolio/images/me.jpg');
  });
  it('renders social links', () => {
    render(<HeroSection profile={fixture.profile} />);
    expect(screen.getByRole('link', { name: /Email/ })).toHaveAttribute('href', 'mailto:fixture@example.com');
    expect(screen.getByRole('link', { name: /LinkedIn/ })).toHaveAttribute('href', 'https://www.linkedin.com/in/fixture');
    expect(screen.getByRole('link', { name: /GitHub/ })).toHaveAttribute('href', 'https://github.com/fixture');
  });
});

describe('ProjectCard', () => {
  it('renders title, summary, tags, date and external links', () => {
    render(<ProjectCard project={alpha} image={{ src: '/portfolio/og-image.png' }} hasDetail />);
    expect(screen.getByRole('heading', { name: 'Fixture Alpha' })).toBeInTheDocument();
    expect(screen.getByText(alpha.summary)).toBeInTheDocument();
    expect(screen.getByText('Oct 2026')).toBeInTheDocument();
    expect(screen.getByText('Astro')).toBeInTheDocument();
    const img = screen.getByRole('img', { name: 'Fixture alpha screenshot' });
    expect(img).toHaveAttribute('loading', 'lazy');
    const repo = screen.getByRole('link', { name: /Repo/ });
    expect(repo).toHaveAttribute('target', '_blank');
    expect(repo).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(repo).getByText('(opens in new tab)')).toHaveClass('sr-only');
    expect(screen.getByRole('link', { name: /Demo/ })).toHaveAttribute('href', 'https://example.com/alpha');
    expect(screen.getByRole('link', { name: /Read more/ })).toHaveAttribute('href', '/portfolio/projects/fixture-alpha/');
  });
  it('omits image, links and Read more when absent', () => {
    const { container } = render(<ProjectCard project={gamma} hasDetail={false} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('ProjectsSection', () => {
  it('renders featured first under Featured, then More projects, preserving order', () => {
    const { container } = render(<ProjectsSection projects={[gamma, alpha, admin]} images={{}} />);
    expect(container.querySelector('section#projects')).not.toBeNull();
    const featured = screen.getByRole('region', { name: 'Featured' });
    const more = screen.getByRole('region', { name: 'More projects' });
    expect(within(featured).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['Fixture Alpha', 'Fixture Admin Dashboard']);
    expect(within(more).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['Fixture Gamma']);
  });
  it('shows Read more only for non-empty descriptions', () => {
    render(<ProjectsSection projects={[alpha, gamma, { ...gamma, id: 'blank', title: 'Blank', description: '   ' }]} images={{}} />);
    expect(screen.getAllByRole('link', { name: /Read more/ })).toHaveLength(1);
  });
  it('hides an empty group heading', () => {
    render(<ProjectsSection projects={[gamma]} images={{}} />);
    expect(screen.queryByText('Featured')).toBeNull();
    expect(screen.getByText('More projects')).toBeInTheDocument();
  });
  it('renders nothing for an empty list', () => {
    expect(renderToStaticMarkup(<ProjectsSection projects={[]} images={{}} />)).toBe('');
  });
  it('filter markup contract: chips after the h2 and before the first group; cards carry JSON data-tags', () => {
    const { container } = render(<ProjectsSection projects={fixture.projects} images={{}} />);
    const section = container.querySelector('section#projects')!;
    const children = [...section.children];
    expect(children[0]!.tagName).toBe('H2');
    const filter = children[1]!;
    expect(filter).toHaveAttribute('data-project-filter');
    expect(filter).toHaveAttribute('role', 'group');
    expect(filter).toHaveAttribute('aria-label', 'Filter projects by technology');
    expect(filter).toHaveAttribute('hidden');
    const status = children[2]!;
    expect(status).toHaveAttribute('data-project-filter-status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveClass('sr-only');
    expect(children[3]).toHaveAttribute('data-project-group', 'featured');
    expect(children[4]).toHaveAttribute('data-project-group', 'more');
    const cards = [...section.querySelectorAll('li[data-project-card]')];
    expect(cards).toHaveLength(fixture.projects.length);
    expect(cards.map((c) => JSON.parse(c.getAttribute('data-tags')!))).toEqual(
      [...fixture.projects.filter((p) => p.featured), ...fixture.projects.filter((p) => !p.featured)].map((p) => p.tags.map((t) => t.toLowerCase())),
    );
  });
  it('omits the filter with fewer than 2 distinct tags but keeps the status/group markup', () => {
    const { container } = render(<ProjectsSection projects={[{ ...gamma, tags: ['React'] }, { ...alpha, tags: ['react'] }]} images={{}} />);
    expect(container.querySelector('[data-project-filter]')).toBeNull();
    expect(container.querySelectorAll('[data-project-card]')).toHaveLength(2);
  });
});

describe('ProjectFilter', () => {
  it('renders All + chips with lowercased data-tag, hidden by default', () => {
    const { container } = render(<ProjectFilter tags={['Astro', 'C|D', 'React']} />);
    const group = container.querySelector('[data-project-filter]')!;
    expect(group).toHaveAttribute('hidden');
    const buttons = [...group.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['All', 'Astro', 'C|D', 'React']);
    expect(buttons.map((b) => b.getAttribute('data-tag'))).toEqual(['', 'astro', 'c|d', 'react']);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
    for (const b of buttons) expect(b).toHaveAttribute('type', 'button');
  });
  it('renders nothing for fewer than 2 tags', () => {
    expect(renderToStaticMarkup(<ProjectFilter tags={['React']} />)).toBe('');
    expect(renderToStaticMarkup(<ProjectFilter tags={[]} />)).toBe('');
  });
});

describe('ProjectDetail', () => {
  it('renders back link, metadata, buttons and the html', () => {
    render(<ProjectDetail project={alpha} image={{ src: '/portfolio/og-image.png' }} html="<h2>Rendered</h2>" />);
    expect(screen.getByRole('link', { name: '← All projects' })).toHaveAttribute('href', '/portfolio/#projects');
    expect(screen.getByRole('heading', { level: 1, name: 'Fixture Alpha' })).toBeInTheDocument();
    expect(screen.getByText('Oct 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View repository/ })).toHaveAttribute('href', 'https://github.com/fixture/alpha');
    expect(screen.getByRole('link', { name: /Live demo/ })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('heading', { level: 2, name: 'Rendered' })).toBeInTheDocument();
  });
  it('omits optional parts', () => {
    const { container } = render(<ProjectDetail project={admin} html="<p>x</p>" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByRole('link', { name: /View repository/ })).toBeNull();
  });
});

describe('Stack', () => {
  it('renders icon path with currentColor and years', () => {
    const { container } = render(<ul><SkillChip skill={{ id: 'ts', name: 'TypeScript', category: 'languages', years: 5 }} icon={{ path: 'M0 0h24v24H0z', title: 'TypeScript' }} /></ul>);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg.querySelector('path')).toHaveAttribute('fill', 'currentColor');
    expect(screen.getByText('5 yrs')).toBeInTheDocument();
  });
  it('falls back to initials without an icon', () => {
    const { container } = render(<ul><SkillChip skill={{ id: 'x', name: 'Fixturelang', category: 'languages' }} icon={null} /></ul>);
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.getByText('Fi')).toBeInTheDocument();
    expect(screen.queryByText(/yrs/)).toBeNull();
  });
  it('groups skills in fixed category order, hiding empty groups', () => {
    const skills = [
      { id: 'd', name: 'Docker', category: 'tools' as const },
      { id: 'r', name: 'React', category: 'frameworks' as const },
      { id: 't', name: 'TypeScript', category: 'languages' as const },
    ];
    render(<SkillsSection skills={skills} icons={{}} />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Languages', 'Frameworks', 'Tools']);
  });
  it('renders nothing for no skills', () => expect(renderToStaticMarkup(<SkillsSection skills={[]} icons={{}} />)).toBe(''));
});

describe('Certifications', () => {
  const [current, expired] = fixture.certifications;
  it('renders issued/expires, credential and Verify', () => {
    render(<CertificationCard certification={current!} now="2026-11" />);
    expect(screen.getByText('Issued Mar 2024 · Expires Mar 2099')).toBeInTheDocument();
    expect(screen.getByText('ID FIX-123')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Verify/ })).toHaveAttribute('href', 'https://example.com/verify/fix-123');
    expect(screen.queryByText('Expired')).toBeNull();
  });
  it('shows Expired when expires < now', () => {
    render(<CertificationCard certification={expired!} now="2026-11" />);
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
  it('renders a badge image when given', () => {
    render(<CertificationCard certification={current!} badge={{ src: 'https://x.com/b.png' }} now="2026-11" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://x.com/b.png');
  });
  it('section renders cards or nothing', () => {
    render(<CertificationsSection certifications={fixture.certifications} badges={{}} now="2026-11" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Certifications' })).toBeInTheDocument();
    expect(renderToStaticMarkup(<CertificationsSection certifications={[]} badges={{}} now="2026-11" />)).toBe('');
  });
});

describe('Journey', () => {
  const [work, edu] = fixture.experience;
  it('shows Present for end null, highlights and tags', () => {
    render(<ol><TimelineItem entry={work!} /></ol>);
    expect(screen.getByText('Jan 2022 – Present')).toBeInTheDocument();
    expect(screen.getByText('Fixture highlight.')).toBeInTheDocument();
    expect(screen.getByText('Work')).toHaveClass('sr-only');
    expect(screen.getByText(/Fixture Company/)).toBeInTheDocument();
  });
  it('omits empty highlights', () => {
    const { container } = render(<ol><TimelineItem entry={edu!} /></ol>);
    expect(screen.getByText('Sep 2017 – Jun 2021')).toBeInTheDocument();
    expect(screen.getByText('Education')).toBeInTheDocument();
    expect(container.querySelectorAll('ul')).toHaveLength(0);
  });
  it('section is an ordered list or nothing', () => {
    const { container } = render(<TimelineSection experience={fixture.experience} />);
    expect(container.querySelector('section#journey ol')?.children).toHaveLength(2);
    expect(renderToStaticMarkup(<TimelineSection experience={[]} />)).toBe('');
  });
});

describe('ContactSection and Tag', () => {
  it('renders Get in touch with links only', () => {
    const { container } = render(<ContactSection socials={fixture.profile.socials} />);
    expect(screen.getByRole('heading', { name: 'Get in touch' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /fixture@example.com/ })).toHaveAttribute('href', 'mailto:fixture@example.com');
    expect(screen.getByRole('link', { name: /LinkedIn/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /GitHub/ })).toBeInTheDocument();
    expect(container.querySelector('form')).toBeNull();
  });
  it('Tag and TagList', () => {
    render(<TagList tags={['A', 'B']} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(renderToStaticMarkup(<TagList tags={[]} />)).toBe('');
    expect(renderToStaticMarkup(<ul><Tag label="X" /></ul>)).toContain('X');
  });
});
