import * as vscode from 'vscode'
import { spawn } from 'child_process'
import { dirname } from 'path'

import { CrystalProblemsFinder } from './crystalProblemsFinder'
import { ENV, ROOT, Concurrent, mainFile } from './crystalConfiguration'
import { statusBarItem } from './crystalStatusBar'

export class CrystalImplementationsProvider extends CrystalProblemsFinder implements vscode.DefinitionProvider {

	/**
	 * Execute crystal tool context for current file:position
	 * and do syntax checking too if enabled.
	 */
	crystalImplementations(document: vscode.TextDocument, position: vscode.Position) {
		let self = this
		return new Promise(function (resolve, reject) {
			let response = ''
			const config = vscode.workspace.getConfiguration('crystal-lang')
			if (Concurrent.counter < Concurrent.limit() && config['implementations']) {
				let scope = mainFile(document.fileName)
				Concurrent.counter += 1
				statusBarItem.text = `${config['compiler']} tool implemetations is working...`
				statusBarItem.show()
				let child = spawn(`${config['compiler']}`, [
					'tool',
					'implementations',
					'-c',
					`${document.fileName}:${position.line + 1}:${position.character + 1}`,
					`${scope}`,
					'--no-color',
					'--error-trace',
					'-f',
					'json'
				], { cwd: ROOT, env: ENV })
				child.stdout.on('data', (data) => {
					response += data
				})
				child.stdout.on('end', () => {
					self.searchProblems(response.toString(), document.uri)
					Concurrent.counter -= 1
					statusBarItem.hide()
					return resolve(response)
				})
				child.on('error', (err) => {
					vscode.window.showErrorMessage('Crystal compiler not found. ' + err.message)
					console.error(err.message)
				})
			} else if (config['implementations']) {
				return resolve('{"status":"blocked"}')
			} else {
				return resolve('')
			}
		})
	}

	async provideDefinition(document: vscode.TextDocument, position: vscode.Position) {
		let crystalOutput = await this.crystalImplementations(document, position)
		let locations: vscode.Location[] = []
		if (crystalOutput.toString().startsWith('{"status":"')) {
			try {
				let crystalMessageObject = JSON.parse(crystalOutput.toString())
				if (crystalMessageObject.status == 'ok') {
					for (let element of crystalMessageObject.implementations) {
						let position = new vscode.Position(element.line - 1, element.column - 1)
						let location = new vscode.Location(vscode.Uri.file(element.filename), position)
						locations.push(location)
					}
				} else if (crystalMessageObject.status == 'blocked') {
					console.info('INFO: crystal is taking a moment to check implementation')
				}
			} catch (err) {
				console.error('ERROR: JSON.parse failed to parse crystal implementations output')
				throw err
			}
		}
		return locations
	}
}
