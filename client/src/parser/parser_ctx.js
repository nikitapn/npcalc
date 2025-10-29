// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

let Parser = require('./parser');
let elements_table = require('./elements.js');

const ELEMENTS_MAX = 50;

class Ast_Script {
	constructor(lst) {
		this.lst = lst;
	}
};

class Ast_StmtList {
	constructor() {
		this.stmts = [];
	}
	push(stmt) {
		this.stmts.push(stmt);
	}
};

class Ast_AssignmentDirectly {
	constructor(index, percent) {
		this.index = index; 
		this.percent = percent;
	}
	eval() {
		return {directly: true, index: this.index, percent: this.percent};
	}
}

class Ast_AssignmentSolution {
	constructor(solution) {
		this.solution = solution;
	}
	eval(other) {
		if (other.type !== undefined) throw "fertilizer type redifinition...";
		other.type = 2;
		other.density = this.solution;
		return null;
	}
}

class Ast_AssignmentDensity {
	constructor(density) {
		this.density = density;
	}
	eval(other) {
		if (other.type !== undefined) throw "fertilizer type redifinition...";
		other.type = 1;
		other.density = this.density;
		return null;
	}
}

class Ast_AssignmentBottle {
	constructor(bottle) {
		this.bottle = bottle;
	}
	eval(other) {
		if (other.bottle !== undefined) throw "bottle redifinition...";
		other.bottle = this.bottle;
		return null;
	}
}

class Ast_AssignmentCost {
	constructor(cost) {
		this.cost = cost;
	}
	eval(other) {
		if (other.cost !== undefined) throw "cost redifinition...";
		other.cost = this.cost;
		return null;
	}
}

class Ast_Substance {
	constructor(exp, purity) {
		this.x = new Ast_FormulaList(exp);
		this.purity = purity;
	}
	eval() {
		let result = this.x.eval();
		if (this.purity === null) return result;
		
		let k = this.purity * 0.01;

		for (let e of result.elements) {
			e.mass *= k;
			e.percent *= k;
			if (e.nh2_count !== undefined) {
				e.nh2_percent *= k;
				e.nh4_percent *= k;
				e.no3_percent *= k;
			}
		}
		result.mass *= k;
		return result;
	}
};

class Ast_FormulaList {
	constructor(exp) {
		this.lst = [];
		exp.linearize(this.lst);
	}
	push(formula) {
		this.lst.push(formula);
	}

	eval() {
		let elements_sp; 
		{
			let m_count = this.lst[0].count;
			this.lst[0] = this.lst[0].formula.eval()
			elements_sp = this.lst[0];
			for (let i = 0; i < ELEMENTS_MAX; ++i) {
				elements_sp.elements[i] *= m_count;
			}
			elements_sp.nh2_count *= m_count;
			elements_sp.nh4_count *= m_count;
			elements_sp.no3_count *= m_count;
		}
		
		if (this.lst.length > 1) {
			elements_sp = this.lst.reduce((m1, m2) => {
				let _1 = m1;
				let _2 = m2.formula.eval();
				for (let i = 0; i < ELEMENTS_MAX; ++i) {
					_1.elements[i] += _2.elements[i] * m2.count
				}
				_1.nh2_count += _2.nh2_count * m2.count;
				_1.nh4_count += _2.nh4_count * m2.count;
				_1.no3_count += _2.no3_count * m2.count;
				return _1;
			});
		} 
		let sum = elements_sp.elements.reduce((a, b) => a + b);
		let elements = [];
		for (let i = 0; i < ELEMENTS_MAX; ++i) {
			if (elements_sp.elements[i] === 0.0) continue;
			let obj = {
				e: elements_table[i].symbol, 
				n: i, 
				mass: elements_sp.elements[i], 
				percent: elements_sp.elements[i] / sum * 100
			};
			let n_sum = elements_sp.nh2_count + elements_sp.no3_count + elements_sp.nh4_count;
			if (i == 7 - 1 && n_sum > 0) {
				obj.nh2_count = elements_sp.nh2_count;
				obj.nh4_count = elements_sp.nh4_count;
				obj.no3_count = elements_sp.no3_count;
				obj.nh2_percent = elements_sp.nh2_count / n_sum * obj.percent;
				obj.nh4_percent = elements_sp.nh4_count / n_sum * obj.percent;
				obj.no3_percent = elements_sp.no3_count / n_sum * obj.percent;
			}
			elements.push(obj);
		}
		return { mass: sum, elements: elements };
	}
};

class Ast_Molecule {
	constructor(formula, count) {
		this.formula = formula;
		this.count = count;
	}
};

class Ast_Formula {
	constructor() {
		this.lst = [];
	}
	push(node) {
		this.lst.push(node);
	}
	eval() {
		let elements = new Array(ELEMENTS_MAX);
		let nh2_count = 0;
		let nh4_count = 0;
		let no3_count = 0;
		elements.fill(0.0);
		for (let i = 0; i < this.lst.length; ++i) {
			let node = this.lst[i];
			if (node instanceof Ast_Group) {
				let result = node.eval();
				for (let i = 0; i < ELEMENTS_MAX; ++i) elements[i] += node.count * result.elements[i];
				nh2_count += node.count * result.nh2_count;
				nh4_count += node.count * result.nh4_count;
				no3_count += node.count * result.no3_count;
			} else {
				let n = node.n - 1;
				let count = node.count;
				elements[n] += elements_table[n].mass * count;
				if (node.n == 7 && i + 1 < this.lst.length) {
					let next = this.lst[i + 1];
					if (!(next instanceof Ast_Group)) {
						if (next.n === 1 && next.count === 2) nh2_count += count;
						if (next.n === 1 && next.count === 4) nh4_count += count;
						if (next.n === 8 && next.count === 3) no3_count += count;
					}
				}
			}
		}
		return {
			elements: elements, 
			nh2_count: nh2_count, 
			nh4_count: nh4_count, 
			no3_count: no3_count 
		};
	}
};

class Ast_Group extends Ast_Formula {
	constructor(formula, count) {
		super();
		this.lst = formula.lst;
		this.count = count;
	}
}

class Ast_Atom {
	constructor(data) {
		[this.n, this.count] = data
	}
}

class Ast_ExprSingle {
	constructor(exp) {
		this.exp = exp;
	}
	linearize(lst) {
		lst.push(this.exp);
	}
}

class Ast_ExprNode {
	constructor(l, r) {
		this.l = l;
		this.r = r;
	}
	linearize(lst) {
		if (this.l instanceof Ast_Molecule) {
			lst.push(this.l);
		} else {
			this.l.linearize(lst);
		}
		if (this.r instanceof Ast_Molecule) {
			lst.push(this.r);
		} else {
			this.r.linearize(lst);
		}
	}
}

let ctx = {
	Ast_Script: Ast_Script,
	Ast_StmtList: Ast_StmtList,
	Ast_Substance: Ast_Substance,
	Ast_ExprSingle: Ast_ExprSingle,
	Ast_ExprNode: Ast_ExprNode,
	Ast_Molecule: Ast_Molecule,
	Ast_Atom: Ast_Atom,
	Ast_Formula: Ast_Formula,
	Ast_Group: Ast_Group,
	Ast_AssignmentDirectly: Ast_AssignmentDirectly,
	Ast_AssignmentSolution: Ast_AssignmentSolution,
	Ast_AssignmentDensity: Ast_AssignmentDensity,
	Ast_AssignmentBottle: Ast_AssignmentBottle,
	Ast_AssignmentCost: Ast_AssignmentCost,
}

/*
try {
	let result = Parser.parse(process.argv[2], ctx);
	console.log(result.lst.stmts[0].eval());
} catch(e) {
	console.log("Parse Error:");
	console.log(e);
}
*/

function create_table () {
	let str = "let table = [";
	for (let i = 0; i < ELEMENTS_MAX; ++i) {
		switch (elements_table[i].symbol) {
			case "N": str += "0,"; break;
			case "P": str += "2,"; break;
			case "K": str += "3,"; break;
			case "Ca": str += "4,"; break;
			case "Mg": str += "5,"; break;
			case "S": str += "6,"; break;
			case "Cl": str += "7,"; break;
			case "Fe": str += "8,"; break;
			case "Zn": str += "9,"; break;
			case "B": str += "10,"; break;
			case "Mn": str += "11,"; break;
			case "Cu": str += "12,"; break;
			case "Mo": str += "13,"; break;
			default: str += "undefined,";
		}
	}
	str += "];"
	return str;
}

// console.log(create_table());


exports.parse = function (text) { return Parser.parse(text, ctx); };