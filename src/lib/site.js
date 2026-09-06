/**
 * Brand + content. Everything user-facing that isn't structural lives here.
 *
 * PLACEHOLDERS — replace before launch. Each is written so it cannot be
 * mistaken for real data if it slips through: `20XX` is not a year, `.example`
 * is an IANA-reserved domain that can never resolve, and "City, Country" is
 * plainly a blank. A plausible-looking guess would be worse than an obvious
 * gap, because nobody would catch it.
 *
 *   founded   real year
 *   base      real city and country
 *   email     real address (also unblocks the contact section's only action)
 *   socials   real profile URLs, or delete the ones that don't exist
 *   footer    a privacy policy URL, or delete that entry
 *
 * Everything else on the page is factual.
 */
export const SITE = {
	name: 'Astro',
	suffix: null, // no tagline lockup yet
	founded: '20XX', // PLACEHOLDER
	base: 'City, Country', // PLACEHOLDER
	blurb: 'A technology company building\nproducts, experiences, and data',
	founders: ['Ehab Hasan', 'Mohe Nader'],
	email: 'hello@astro.example', // PLACEHOLDER — reserved domain, cannot resolve
	// `href: null` is deliberate. A null href renders an <a> with no href
	// attribute, which the browser treats as plain text: not clickable, not
	// focusable, not a broken link that silently goes nowhere. Paste a real URL
	// in and it becomes a working link with nothing else to change. Delete any
	// profile that does not exist rather than leaving it null.
	socials: [
		{ label: 'X', href: null }, // PLACEHOLDER
		{ label: 'LinkedIn', href: null }, // PLACEHOLDER
		{ label: 'GitHub', href: null } // PLACEHOLDER
	]
};

/**
 * Where the contact form sends.
 *
 * PLACEHOLDER — `endpoint` is null, so the form has no server behind it yet.
 * Until one is set it falls back to composing a message in the visitor's own
 * mail client, and it says so on screen. It never reports a message as sent
 * when nothing was sent: a false confirmation is the one outcome worse than an
 * obviously-unfinished form, because the visitor stops waiting for a reply.
 *
 * To connect it, set `endpoint` to a URL that accepts a JSON POST of
 * `{ name, email, message }` — a form service (Formspree, Basin), a serverless
 * function, or a SvelteKit endpoint of your own. Nothing else here changes.
 *
 * Note that a live endpoint also inherits a spam problem. Whatever you point
 * this at should do the filtering; there is deliberately no half-measure in
 * the client, because a honeypot that catches nothing is worse than no claim
 * to catch anything.
 */
export const CONTACT = {
	endpoint: null // PLACEHOLDER
};

/** Per-section copy. Keys match SECTIONS[].id in scroll/sections.js. */
export const COPY = {
	hero: {
		headline: ['Products,', 'experiences,', 'and data']
	},

	about: {
		headline: ['A new', 'technology', 'company'],
		lede: 'Astro builds its own software, designs digital experiences for other companies and people, and is developing products around data.'
	},

	work: {
		headline: ['Three', 'kinds of', 'work'],
		lede: 'One company, three practices.',
		columns: [
			{
				title: 'Products',
				items: ['Software we own', 'Built and operated in-house']
			},
			{
				title: 'Studio',
				items: ['Websites and web apps', 'Digital experiences', 'Built for clients']
			},
			{
				title: 'Data',
				items: ['Working with data', 'Data products in development']
			}
		]
	},

	products: {
		headline: ['Our own', 'software'],
		lede: 'We build products we own and operate, rather than only building for others.',
		items: [
			{
				title: 'DentFlow',
				status: 'In development',
				body: 'A clinic operating system — software to run a practice day to day.'
			}
		],
		note: 'More products will follow.'
	},

	studio: {
		headline: ['Digital', 'studio'],
		lede: 'We design and build digital work for companies and individuals.',
		// The one mid-page call to action. It sits on Studio because that is the
		// practice a visitor can actually hire, and `to` names a section id so
		// the button follows the section table rather than a hard-coded index.
		cta: { label: 'Start a project', to: 'contact' },
		columns: [
			{
				title: 'For companies',
				items: ['Company websites', 'Corporate websites', 'Web applications']
			},
			{
				title: 'For people',
				items: ['Personal websites', 'Portfolios', 'Personal brands']
			}
		]
	},

	data: {
		headline: ['Data'],
		lede: 'The newest part of Astro. We are working with data and building products around it.',
		note: 'Scope, markets and customers are still being defined. This section will say more as it does.'
	},

	selected: {
		headline: ['Selected', 'work'],
		lede: 'A place for the work once there is work to show.',
		// PLACEHOLDER — all six cards. The artwork is generated (see
		// scripts that wrote static/work/*.svg): abstract, licence-free, and
		// stamped "PLACEHOLDER" so it cannot pass for a real project.
		//
		// To replace: swap `img` for a real image, put the real project name in
		// `title`, and give each <img> a real `alt` describing the picture — the
		// cards currently use alt="" because the artwork carries no meaning.
		note: 'Placeholder cards. Real projects replace these.',
		cards: [
			{ n: '01', title: 'Project slot 01', img: '/work/slot-01.svg' },
			{ n: '02', title: 'Project slot 02', img: '/work/slot-02.svg' },
			{ n: '03', title: 'Project slot 03', img: '/work/slot-03.svg' },
			{ n: '04', title: 'Project slot 04', img: '/work/slot-04.svg' },
			{ n: '05', title: 'Project slot 05', img: '/work/slot-05.svg' },
			{ n: '06', title: 'Project slot 06', img: '/work/slot-06.svg' }
		]
	},

	founders: {
		headline: ['Who', 'we are'],
		lede: 'Astro was founded by Ehab Hasan and Mohe Nader.'
	},

	contact: {
		headline: ['Get', 'in touch'],
		lede: 'Tell us what you are building. A few sentences is enough.',
		// The button says what pressing it does. "Submit" describes the form's
		// mechanism; "Send message" describes the person's intent.
		// The footer under the form. `rights` is a statement of fact and needs no
		// filling in; the year comes from the clock rather than being written down.
		footer: {
			rights: 'All rights reserved.',
			links: [
				{ label: 'Privacy policy', href: null } // PLACEHOLDER — no page yet
			]
		},
		form: {
			submit: 'Send message',
			fields: [
				{
					name: 'name',
					label: 'Name',
					placeholder: 'Who you are',
					type: 'text',
					autocomplete: 'name'
				},
				{
					name: 'email',
					label: 'Email',
					placeholder: 'Where we should reply',
					type: 'email',
					autocomplete: 'email'
				},
				{
					name: 'message',
					label: 'Message',
					placeholder: 'Tell us what you are building',
					type: 'textarea',
					autocomplete: 'off'
				}
			]
		}
	}
};
