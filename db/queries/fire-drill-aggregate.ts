export type FireDrillJoinRow<Report extends {id: string}, Participant> = {
	report: Report;
	participant: Participant | null;
};

export function groupFireDrillJoinRows<Report extends {id: string}, Participant>(
	rows: readonly FireDrillJoinRow<Report, Participant>[]
): Array<Report & {participants: Participant[]}> {
	const aggregates = new Map<
		string,
		Report & {participants: Participant[]}
	>();

	for (const row of rows) {
		let aggregate = aggregates.get(row.report.id);
		if (!aggregate) {
			aggregate = {...row.report, participants: []};
			aggregates.set(row.report.id, aggregate);
		}
		if (row.participant) aggregate.participants.push(row.participant);
	}

	return Array.from(aggregates.values());
}
