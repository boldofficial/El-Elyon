'use client';

import React, {useState, useEffect} from 'react';

interface GuardianChecklistPublicProps {
	token: string;
}

export default function GuardianChecklistPublic({
	token,
}: GuardianChecklistPublicProps) {
	const [checklistData, setChecklistData] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [responses, setResponses] = useState<Record<string, any>>({});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitted, setSubmitted] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function fetchChecklist() {
			try {
				const res = await fetch(
					`/api/guardian-checklists/by-token?token=${token}`
				);
				const data = await res.json();
				setChecklistData(data);
			} catch (err) {
				console.error('Error fetching checklist:', err);
			} finally {
				setLoading(false);
			}
		}

		fetchChecklist();
	}, [token]);

	if (loading) {
		return (
			<div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
					<p className="mt-4 text-gray-600">Loading checklist...</p>
				</div>
			</div>
		);
	}

	if (!checklistData || !checklistData.link || !checklistData.template) {
		return (
			<div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
				<div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
					<div className="text-red-600 text-5xl mb-4">❌</div>
					<h2 className="text-2xl font-bold text-gray-900 mb-2">
						Invalid Link
					</h2>
					<p className="text-gray-600">
						This checklist link is invalid or has been removed.
					</p>
				</div>
			</div>
		);
	}

	if (checklistData.expired) {
		return (
			<div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
				<div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
					<div className="text-yellow-600 text-5xl mb-4">⏰</div>
					<h2 className="text-2xl font-bold text-gray-900 mb-2">
						Link Expired
					</h2>
					<p className="text-gray-600">
						This checklist link has expired. Please contact the care facility
						for a new link.
					</p>
				</div>
			</div>
		);
	}

	if (checklistData.link.completed || submitted) {
		return (
			<div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
				<div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
					<div className="text-green-600 text-5xl mb-4">✅</div>
					<h2 className="text-2xl font-bold text-gray-900 mb-2">Thank You!</h2>
					<p className="text-gray-600">
						Your responses have been submitted successfully. The care team will
						review your feedback.
					</p>
				</div>
			</div>
		);
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		// Validate required questions
		const requiredQuestions =
			checklistData.template?.questions.filter((q: any) => q.required) || [];
		for (const q of requiredQuestions) {
			if (!responses[q.id]) {
				setError(`Please answer: ${q.text}`);
				return;
			}
		}

		setIsSubmitting(true);
		try {
			const formattedResponses = Object.entries(responses).map(
				([questionId, answer]) => ({
					questionId,
					answer,
				})
			);

			const res = await fetch('/api/guardian-checklists/submit', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({token, responses: formattedResponses}),
			});

			if (!res.ok) {
				throw new Error('Failed to submit responses');
			}

			setSubmitted(true);
		} catch (err: any) {
			setError(err.message || 'Failed to submit responses');
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="min-h-screen bg-gray-50 py-8 px-4">
			<div className="max-w-3xl mx-auto">
				<div className="bg-white rounded-lg shadow-lg p-8">
					<div className="mb-6">
						<h1 className="text-3xl font-bold text-gray-900 mb-2">
							{checklistData.template.name}
						</h1>
						{checklistData.template.description && (
							<p className="text-gray-600">
								{checklistData.template.description}
							</p>
						)}
						<p className="text-sm text-gray-500 mt-2">
							For: <strong>{checklistData.residentName}</strong>
						</p>
					</div>

					<form onSubmit={handleSubmit} className="space-y-6">
						{checklistData.template.questions.map(
							(question: any, index: number) => (
								<div
									key={question.id}
									className="border-b border-gray-200 pb-6">
									<label className="block text-sm font-medium text-gray-900 mb-3">
										{index + 1}. {question.text}
										{question.required && (
											<span className="text-red-500 ml-1">*</span>
										)}
									</label>

									{question.type === 'yes_no' && (
										<div className="flex gap-4">
											<label className="flex items-center">
												<input
													type="radio"
													name={question.id}
													value="yes"
													checked={responses[question.id] === true}
													onChange={() =>
														setResponses({...responses, [question.id]: true})
													}
													className="mr-2"
												/>
												<span>Yes</span>
											</label>
											<label className="flex items-center">
												<input
													type="radio"
													name={question.id}
													value="no"
													checked={responses[question.id] === false}
													onChange={() =>
														setResponses({...responses, [question.id]: false})
													}
													className="mr-2"
												/>
												<span>No</span>
											</label>
										</div>
									)}

									{question.type === 'text' && (
										<textarea
											value={responses[question.id] || ''}
											onChange={(e) =>
												setResponses({
													...responses,
													[question.id]: e.target.value,
												})
											}
											className="w-full border border-gray-300 rounded-md px-3 py-2"
											rows={3}
											placeholder="Your answer..."
										/>
									)}

									{question.type === 'rating' && (
										<div className="flex gap-2">
											{[1, 2, 3, 4, 5].map((rating) => (
												<button
													key={rating}
													type="button"
													onClick={() =>
														setResponses({...responses, [question.id]: rating})
													}
													className={`w-12 h-12 rounded-full border-2 font-medium ${
														responses[question.id] === rating
															? 'bg-blue-600 text-white border-blue-600'
															: 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
													}`}>
													{rating}
												</button>
											))}
										</div>
									)}
								</div>
							)
						)}

						{error && (
							<div className="bg-red-50 border border-red-200 rounded-md p-4">
								<p className="text-red-700 text-sm">{error}</p>
							</div>
						)}

						<div className="flex gap-4">
							<button
								type="submit"
								disabled={isSubmitting}
								className="flex-1 bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium">
								{isSubmitting ? 'Submitting...' : 'Submit Responses'}
							</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
}
