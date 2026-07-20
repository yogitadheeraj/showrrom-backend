import { Request, Response } from 'express';
import { runRpc } from '../services/rpcService.js';

export async function rpcController(req: Request, res: Response) {
  try {
    const data = await runRpc(req.params.name, req.body || {});
    res.status(200).json({ data, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'RPC execution failed';
    res.status(400).json({ data: null, error: { message } });
  }
}
