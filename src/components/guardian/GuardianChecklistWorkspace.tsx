// src/components/workspaces/GuardianChecklistWorkspace.tsx
'use client';

import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';

const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

interface Template {
	id: string;
	name: string;
	description?: string;
	questions: Array<{
		id: string;
		text: string;
		type: 'yes_no' | 'text' | 'rating';
		required: boolean;
	}>;
	active: boolean;
	createdAt: string;
}

interface ChecklistLink {
	id: string;
	residentName: string;
	templateName: string;
	guardianEmail: string;
	completed: boolean;
	expired: boolean;
	sentDate: number;
	token: string;
	questions?: Array<{
		id: string;
		text: string;
		type: 'yes_no' | 'text' | 'rating';
		required: boolean;
	}>;
	responses?: Array<{
		questionId: string;
		answer: string | number | boolean;
	}>;
	completedAt?: number;
}

interface Resident {
	id: string;
	name: string;
	location: string;
}

export default function GuardianChecklistWorkspace() {
	const [activeTab, setActiveTab] = useState<'templates' | 'links'>(
		'templates'
	);
	const [showCreateTemplate, setShowCreateTemplate] = useState(false);
	const [showSendChecklist, setShowSendChecklist] = useState(false);
	const [viewingResponses, setViewingResponses] =
		useState<ChecklistLink | null>(null);

	const [templates, setTemplates] = useState<Template[]>([]);
	const [links, setLinks] = useState<ChecklistLink[]>([]);
	const [residents, setResidents] = useState<Resident[]>([]);
	const [loading, setLoading] = useState(true);

	const [templateForm, setTemplateForm] = useState({
		name: '',
		description: '',
		questions: [] as Array<{
			id: string;
			text: string;
			type: 'yes_no' | 'text' | 'rating';
			required: boolean;
		}>,
	});

	const [sendForm, setSendForm] = useState({
		residentId: '',
		templateId: '',
		guardianEmail: '',
	});

	// Fetch data
	useEffect(() => {
		fetchTemplates();
		fetchLinks();
		fetchResidents();
	}, []);

	const fetchTemplates = async () => {
		try {
			const res = await fetch('/api/guardian-checklists/templates');
			if (!res.ok) throw new Error('Failed to fetch templates');
			const data = await res.json();
			setTemplates(data);
		} catch (error: any) {
			toast.error(error.message);
		}
	};

	const fetchLinks = async () => {
		try {
			const res = await fetch('/api/guardian-checklists/links');
			if (!res.ok) throw new Error('Failed to fetch links');
			const data = await res.json();
			setLinks(data);
		} catch (error: any) {
			toast.error(error.message);
		} finally {
			setLoading(false);
		}
	};

	const fetchResidents = async () => {
		try {
			const res = await fetch('/api/residents');
			if (!res.ok) throw new Error('Failed to fetch residents');
			const data = await res.json();
			setResidents(data);
		} catch (error: any) {
			toast.error(error.message);
		}
	};

	const addQuestion = () => {
		setTemplateForm({
			...templateForm,
			questions: [
				...templateForm.questions,
				{
					id: `q${Date.now()}`,
					text: '',
					type: 'yes_no',
					required: true,
				},
			],
		});
	};

	const updateQuestion = (index: number, field: string, value: any) => {
		const newQuestions = [...templateForm.questions];
		newQuestions[index] = {...newQuestions[index], [field]: value};
		setTemplateForm({...templateForm, questions: newQuestions});
	};

	const removeQuestion = (index: number) => {
		setTemplateForm({
			...templateForm,
			questions: templateForm.questions.filter((_, i) => i !== index),
		});
	};

	const handleCreateTemplate = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!templateForm.name.trim()) {
			toast.error('Template name is required');
			return;
		}
		if (templateForm.questions.length === 0) {
			toast.error('Add at least one question');
			return;
		}

		try {
			const res = await fetch('/api/guardian-checklists/templates', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(templateForm),
			});

			if (!res.ok) throw new Error('Failed to create template');

			toast.success('Template created successfully!');
			setTemplateForm({name: '', description: '', questions: []});
			setShowCreateTemplate(false);
			fetchTemplates();
		} catch (error: any) {
			toast.error(error.message || 'Failed to create template');
		}
	};

	const handleSendChecklist = async (e: React.FormEvent) => {
		e.preventDefault();
		if (
			!sendForm.residentId ||
			!sendForm.templateId ||
			!sendForm.guardianEmail
		) {
			toast.error('All fields are required');
			return;
		}

		try {
			const res = await fetch('/api/guardian-checklists/send', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(sendForm),
			});

			if (!res.ok) throw new Error('Failed to send checklist');

			toast.success(
				'Checklist sent successfully! Email will be delivered shortly.'
			);
			setSendForm({residentId: '', templateId: '', guardianEmail: ''});
			setShowSendChecklist(false);
			fetchLinks();
		} catch (error: any) {
			toast.error(error.message || 'Failed to send checklist');
		}
	};

	const handleResendLink = async (linkId: string) => {
		try {
			const res = await fetch(
				`/api/guardian-checklists/links/${linkId}/resend`,
				{
					method: 'POST',
				}
			);

			if (!res.ok) throw new Error('Failed to resend link');

			toast.success(
				'Checklist link resent successfully! Email will be delivered shortly.'
			);
			fetchLinks();
		} catch (error: any) {
			toast.error(error.message || 'Failed to resend link');
		}
	};

	const handleCopyLink = (token: string) => {
		const url = `${baseUrl}/?checklist=${token}`;
		navigator.clipboard.writeText(url);
		toast.success('Link copied to clipboard!');
	};

	const formatAnswer = (answer: any, questionType: string) => {
		if (questionType === 'yes_no') {
			return answer ? 'Yes' : 'No';
		}
		if (questionType === 'rating') {
			return `${answer}/5`;
		}
		return answer;
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h2 className="text-xl font-semibold">Guardian Checklists</h2>
				<div className="flex gap-2">
					{activeTab === 'templates' && (
						<button
							onClick={() => setShowCreateTemplate(!showCreateTemplate)}
							className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
							{showCreateTemplate ? 'Cancel' : 'Create Template'}
						</button>
					)}
					{activeTab === 'links' && (
						<button
							onClick={() => setShowSendChecklist(!showSendChecklist)}
							className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
							{showSendChecklist ? 'Cancel' : 'Send Checklist'}
						</button>
					)}
				</div>
			</div>

			{/* Tabs */}
			<div className="border-b border-gray-200">
				<nav className="-mb-px flex space-x-8">
					<button
						onClick={() => setActiveTab('templates')}
						className={`py-2 px-1 border-b-2 font-medium text-sm ${
							activeTab === 'templates'
								? 'border-blue-500 text-blue-600'
								: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
						}`}>
						Templates ({templates.length})
					</button>
					<button
						onClick={() => setActiveTab('links')}
						className={`py-2 px-1 border-b-2 font-medium text-sm ${
							activeTab === 'links'
								? 'border-blue-500 text-blue-600'
								: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
						}`}>
						Sent Checklists ({links.length})
					</button>
				</nav>
			</div>

			{/* Create Template Form */}
			{activeTab === 'templates' && showCreateTemplate && (
				<div className="bg-white rounded-lg shadow-sm border p-6">
					<h3 className="text-lg font-semibold mb-4">
						Create Checklist Template
					</h3>
					<form onSubmit={handleCreateTemplate} className="space-y-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Template Name <span className="text-red-500">*</span>
							</label>
							<input
								type="text"
								value={templateForm.name}
								onChange={(e) =>
									setTemplateForm({...templateForm, name: e.target.value})
								}
								className="w-full border border-gray-300 rounded-md px-3 py-2"
								placeholder="e.g., Monthly Wellness Check"
							/>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Description
							</label>
							<textarea
								value={templateForm.description}
								onChange={(e) =>
									setTemplateForm({
										...templateForm,
										description: e.target.value,
									})
								}
								className="w-full border border-gray-300 rounded-md px-3 py-2"
								rows={3}
								placeholder="Optional description"
							/>
						</div>

						<div>
							<div className="flex items-center justify-between mb-2">
								<label className="block text-sm font-medium text-gray-700">
									Questions
								</label>
								<button
									type="button"
									onClick={addQuestion}
									className="text-sm text-blue-600 hover:text-blue-700">
									+ Add Question
								</button>
							</div>

							{templateForm.questions.map((q, index) => (
								<div
									key={q.id}
									className="border border-gray-200 rounded-md p-4 mb-3">
									<div className="flex items-start justify-between mb-2">
										<span className="text-sm font-medium text-gray-700">
											Question {index + 1}
										</span>
										<button
											type="button"
											onClick={() => removeQuestion(index)}
											className="text-red-600 hover:text-red-700 text-sm">
											Remove
										</button>
									</div>

									<input
										type="text"
										value={q.text}
										onChange={(e) =>
											updateQuestion(index, 'text', e.target.value)
										}
										className="w-full border border-gray-300 rounded-md px-3 py-2 mb-2"
										placeholder="Question text"
									/>

									<div className="flex gap-4">
										<select
											id={`q${index}-type`}
											name={`q${index}-type`}
											title="Question type"
											value={q.type}
											onChange={(e) =>
												updateQuestion(index, 'type', e.target.value)
											}
											className="border border-gray-300 rounded-md px-3 py-2">
											<option value="yes_no">Yes/No</option>
											<option value="text">Text</option>
											<option value="rating">Rating (1-5)</option>
										</select>

										<label className="flex items-center">
											<input
												type="checkbox"
												checked={q.required}
												onChange={(e) =>
													updateQuestion(index, 'required', e.target.checked)
												}
												className="mr-2"
											/>
											<span className="text-sm text-gray-700">Required</span>
										</label>
									</div>
								</div>
							))}
						</div>

						<div className="flex gap-2">
							<button
								type="submit"
								className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
								Create Template
							</button>
							<button
								type="button"
								onClick={() => setShowCreateTemplate(false)}
								className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">
								Cancel
							</button>
						</div>
					</form>
				</div>
			)}

			{/* Send Checklist Form */}
			{activeTab === 'links' && showSendChecklist && (
				<div className="bg-white rounded-lg shadow-sm border p-6">
					<h3 className="text-lg font-semibold mb-4">
						Send Checklist to Guardian
					</h3>
					<form onSubmit={handleSendChecklist} className="space-y-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Resident <span className="text-red-500">*</span>
							</label>
							<select
								id="resident"
								name="resident"
								title="Resident"
								value={sendForm.residentId}
								onChange={(e) =>
									setSendForm({...sendForm, residentId: e.target.value})
								}
								className="w-full border border-gray-300 rounded-md px-3 py-2">
								<option value="">Select resident...</option>
								{residents.map((r) => (
									<option key={r.id} value={r.id}>
										{r.name} ({r.location})
									</option>
								))}
							</select>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Template <span className="text-red-500">*</span>
							</label>
							<select
								id="template"
								name="template"
								title="Template"
								value={sendForm.templateId}
								onChange={(e) =>
									setSendForm({...sendForm, templateId: e.target.value})
								}
								className="w-full border border-gray-300 rounded-md px-3 py-2">
								<option value="">Select template...</option>
								{templates
									.filter((t) => t.active)
									.map((t) => (
										<option key={t.id} value={t.id}>
											{t.name}
										</option>
									))}
							</select>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Guardian Email <span className="text-red-500">*</span>
							</label>
							<input
								type="email"
								value={sendForm.guardianEmail}
								onChange={(e) =>
									setSendForm({...sendForm, guardianEmail: e.target.value})
								}
								className="w-full border border-gray-300 rounded-md px-3 py-2"
								placeholder="guardian@example.com"
							/>
						</div>

						<div className="flex gap-2">
							<button
								type="submit"
								className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
								Send Checklist
							</button>
							<button
								type="button"
								onClick={() => setShowSendChecklist(false)}
								className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">
								Cancel
							</button>
						</div>
					</form>
				</div>
			)}

			{/* Templates List */}
			{activeTab === 'templates' && !showCreateTemplate && (
				<div className="bg-white rounded-lg shadow-sm border overflow-hidden">
					<div className="px-6 py-4 border-b border-gray-200">
						<h3 className="text-lg font-semibold">Checklist Templates</h3>
					</div>
					<div className="divide-y divide-gray-200">
						{templates.length === 0 ? (
							<div className="px-6 py-8 text-center text-gray-500">
								<p>
									No templates yet. Create your first template to get started.
								</p>
							</div>
						) : (
							templates.map((template) => (
								<div key={template.id} className="px-6 py-4">
									<div className="flex items-start justify-between">
										<div>
											<h4 className="font-medium text-gray-900">
												{template.name}
											</h4>
											{template.description && (
												<p className="text-sm text-gray-500 mt-1">
													{template.description}
												</p>
											)}
											<p className="text-sm text-gray-500 mt-1">
												{template.questions.length} question
												{template.questions.length !== 1 ? 's' : ''}
											</p>
										</div>
										<span
											className={`px-2 py-1 text-xs font-medium rounded-full ${
												template.active
													? 'bg-green-100 text-green-800'
													: 'bg-gray-100 text-gray-800'
											}`}>
											{template.active ? 'Active' : 'Inactive'}
										</span>
									</div>
								</div>
							))
						)}
					</div>
				</div>
			)}

			{/* Responses Modal */}
			{viewingResponses && (
				<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
					<div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
						<div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
							<h3 className="text-lg font-semibold">Guardian Responses</h3>
							<button
								onClick={() => setViewingResponses(null)}
								className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
								×
							</button>
						</div>
						<div className="p-6 space-y-6">
							<div className="bg-gray-50 rounded-lg p-4 space-y-2">
								<div className="flex justify-between">
									<span className="text-sm font-medium text-gray-700">
										Resident:
									</span>
									<span className="text-sm text-gray-900">
										{viewingResponses.residentName}
									</span>
								</div>
								<div className="flex justify-between">
									<span className="text-sm font-medium text-gray-700">
										Guardian:
									</span>
									<span className="text-sm text-gray-900">
										{viewingResponses.guardianEmail}
									</span>
								</div>
								<div className="flex justify-between">
									<span className="text-sm font-medium text-gray-700">
										Completed:
									</span>
									<span className="text-sm text-gray-900">
										{viewingResponses.completedAt
											? new Date(viewingResponses.completedAt).toLocaleString()
											: 'N/A'}
									</span>
								</div>
							</div>

							<div className="space-y-4">
								<h4 className="font-medium text-gray-900">Responses</h4>
								{viewingResponses.responses &&
								viewingResponses.responses.length > 0 ? (
									viewingResponses.responses.map((response, index) => {
										const question = viewingResponses.questions?.find(
											(q) => q.id === response.questionId
										);
										return (
											<div
												key={index}
												className="border border-gray-200 rounded-lg p-4">
												<p className="font-medium text-gray-900 mb-2">
													{question?.text || `Question ${index + 1}`}
												</p>
												<p className="text-gray-700">
													{formatAnswer(
														response.answer,
														question?.type || 'text'
													)}
												</p>
											</div>
										);
									})
								) : (
									<p className="text-gray-500 text-center py-4">
										No responses available
									</p>
								)}
							</div>
						</div>
						<div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200">
							<button
								onClick={() => setViewingResponses(null)}
								className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">
								Close
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Links List */}
			{activeTab === 'links' && !showSendChecklist && (
				<div className="bg-white rounded-lg shadow-sm border overflow-hidden">
					<div className="px-6 py-4 border-b border-gray-200">
						<h3 className="text-lg font-semibold">Sent Checklists</h3>
					</div>
					<div className="overflow-x-auto">
						<table className="min-w-full divide-y divide-gray-200">
							<thead className="bg-gray-50">
								<tr>
									<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
										Resident
									</th>
									<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
										Template
									</th>
									<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
										Guardian Email
									</th>
									<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
										Status
									</th>
									<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
										Sent Date
									</th>
									<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
										Actions
									</th>
								</tr>
							</thead>
							<tbody className="bg-white divide-y divide-gray-200">
								{links.length === 0 ? (
									<tr>
										<td
											colSpan={6}
											className="px-6 py-8 text-center text-gray-500">
											No checklists sent yet.
										</td>
									</tr>
								) : (
									links.map((link) => (
										<tr key={link.id}>
											<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
												{link.residentName}
											</td>
											<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
												{link.templateName}
											</td>
											<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
												{link.guardianEmail}
											</td>
											<td className="px-6 py-4 whitespace-nowrap">
												<span
													className={`px-2 py-1 text-xs font-medium rounded-full ${
														link.completed
															? 'bg-green-100 text-green-800'
															: link.expired
																? 'bg-red-100 text-red-800'
																: 'bg-yellow-100 text-yellow-800'
													}`}>
													{link.completed
														? 'Completed'
														: link.expired
															? 'Expired'
															: 'Pending'}
												</span>
											</td>
											<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
												{new Date(link.sentDate).toLocaleDateString()}
											</td>
											<td className="px-6 py-4 whitespace-nowrap text-sm space-x-3">
												{link.completed && (
													<button
														onClick={() => setViewingResponses(link)}
														className="text-blue-600 hover:text-blue-800 font-medium">
														View Responses
													</button>
												)}
												{!link.completed && !link.expired && (
													<>
														<button
															onClick={() => handleCopyLink(link.token)}
															className="text-green-600 hover:text-green-800">
															Copy Link
														</button>
														<button
															onClick={() => handleResendLink(link.id)}
															className="text-blue-600 hover:text-blue-800">
															Resend
														</button>
													</>
												)}
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
}
