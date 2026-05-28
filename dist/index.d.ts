#!/usr/bin/env node
import { Command } from 'commander';

declare const buildProgram: () => Command;

export { buildProgram };
