import { Router } from 'express';
import {
  createBoard,
  getBoard,
  listBoards,
  getBoardByToken,
  joinBoardByToken,
  rotateShareToken,
} from '../controllers/boardController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/invite/:token', getBoardByToken);

router.use(protect);

router.post('/', createBoard);
router.get('/', listBoards);
router.get('/:id', getBoard);
router.post('/join/:token', joinBoardByToken);
router.post('/:id/rotate-token', rotateShareToken);

export default router;