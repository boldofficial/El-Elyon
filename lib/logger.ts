/**
 * Centralized logging utility
 * Provides conditional logging based on environment
 * In production, only warnings and errors are logged
 */

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

class Logger {
	/**
	 * Determines if a log level should be output based on environment
	 */
	private shouldLog(level: LogLevel): boolean {
		// In production, only log warnings and errors
		if (process.env.NODE_ENV === 'production') {
			return level === 'warn' || level === 'error';
		}
		// In development, log everything
		return true;
	}

	/**
	 * Formats log message with timestamp and level
	 */
	private formatMessage(level: string, args: any[]): any[] {
		return [`[${level}]`, new Date().toISOString(), ...args];
	}

	/**
	 * General log messages
	 */
	log(...args: any[]) {
		if (this.shouldLog('log')) {
			console.log(...this.formatMessage('LOG', args));
		}
	}

	/**
	 * Informational messages
	 */
	info(...args: any[]) {
		if (this.shouldLog('info')) {
			console.info(...this.formatMessage('INFO', args));
		}
	}

	/**
	 * Warning messages
	 */
	warn(...args: any[]) {
		if (this.shouldLog('warn')) {
			console.warn(...this.formatMessage('WARN', args));
		}
	}

	/**
	 * Error messages (always logged)
	 */
	error(...args: any[]) {
		if (this.shouldLog('error')) {
			console.error(...this.formatMessage('ERROR', args));
		}
	}

	/**
	 * Debug messages (development only)
	 */
	debug(...args: any[]) {
		if (this.shouldLog('debug')) {
			console.debug(...this.formatMessage('DEBUG', args));
		}
	}

	/**
	 * Log API request details
	 */
	apiRequest(method: string, path: string, userId?: string) {
		this.info(`API ${method} ${path}`, userId ? `User: ${userId}` : 'Anonymous');
	}

	/**
	 * Log API response with status
	 */
	apiResponse(method: string, path: string, status: number, duration?: number) {
		const msg = [`API ${method} ${path}`, `Status: ${status}`];
		if (duration) {
			msg.push(`Duration: ${duration}ms`);
		}
		this.info(...msg);
	}

	/**
	 * Log database query (development only)
	 */
	dbQuery(operation: string, table: string, details?: string) {
		this.debug(`DB ${operation} ${table}`, details || '');
	}
}

// Export singleton instance
export const logger = new Logger();
