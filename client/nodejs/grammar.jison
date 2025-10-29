// Copyright (c) 2022-2025 nikitapnn1@gmail.com
// This file is a part of Nikita's NPK calculator and covered by LICENSING file in the topmost directory

%lex

%%
\s+                   /* skip whitespace */
//[(\n)]                {}
[0-9]*"."[0-9]+       return 'DECIMAL';
[0-9]+  		  	  return 'INTEGER'
(":=")				  return 'ASSIGNMENT';

(";")			  	  return ';';

"formula"	  		  return 'FORMULA';
"purity"	  		  return 'PURITY';
"density"	  		  return 'DESITY';
"solution"	  		  return 'SOLUTION';
"bottle"	  		  return 'BOTTLE';
"cost"	  		  	  return 'COST';
("Ca")				  return 'Ca';
("Mg")				  return 'Mg';
("Cl")				  return 'Cl';
("Fe")				  return 'Fe';
("Mn")				  return 'Mn';
("Zn")				  return 'Zn';
("Cu")				  return 'Cu';
("Mo")				  return 'Mo';
("Ni")				  return 'Ni';
("Si")				  return 'Si';
("Co")				  return 'Co';
("Ag")				  return 'Ag';
("Al")				  return 'Al';
("Na")				  return 'Na';
("N-NO3")			  return 'N_NO3';
("N-NH4")			  return 'N_NH4';
("O")			      return 'O';
("H")				  return 'H';
("N")				  return 'N';
("P")				  return 'P';
("K")				  return 'K';
("S")				  return 'S';
("A")		  	      return 'A';
("B")			  	  return 'B';
("C")			      return 'C';

[\*|•]				  return '*';
"/"                   return '/';
"-"                   return '-';
"+"                   return '+';
"^"                   return '^';
"("                   return '(';
")"                   return ')';
"PI"                  return 'PI';
"E"                   return 'E';

/lex

%right ASSIGNMENT
%left '+' '-'
%left '*' '/'
%left '^'
%left UMINUS

%start script

%parse-param ctx

%% /* language grammar */

script:
			stmt_list 										{ return new ctx.Ast_Script($1); }
			;

stmt_list:
			/*%empty*/ 										{ $$ = new ctx.Ast_StmtList(); }
	|		stmt_list stmt 									{ $$ = $1;  if ($2 !== null) $$.push($2); }
			;

stmt:
			substance ';'									{ $$ = $1; }
	|		directly ASSIGNMENT number ';'					{ $$ = new ctx.Ast_AssignmentDirectly($1, $3); }
	|		SOLUTION ASSIGNMENT exp ';'						{ $$ = new ctx.Ast_AssignmentSolution($3); }
	|		DESITY ASSIGNMENT exp ';'						{ $$ = new ctx.Ast_AssignmentDensity($3); }
	|		BOTTLE ASSIGNMENT bottle ';'					{ $$ = new ctx.Ast_AssignmentBottle($3); }
	|		COST ASSIGNMENT number ';'						{ $$ = new ctx.Ast_AssignmentCost($3); }
	|		';'												{ $$ = null; }
			;

bottle:
			'A' 											{ $$ = 0; }
	|		'B'												{ $$ = 1; }
	|		'C'												{ $$ = 2; }
			;

directly:
			'N_NO3' 										{ $$ = 0; }
	|		'N_NH4'											{ $$ = 1; }		
	|		'P'												{ $$ = 2; }		
	|		'K'												{ $$ = 3; }		
	|		'Ca'											{ $$ = 4; }		
	|		'Mg'											{ $$ = 5; }		
	|		'S'												{ $$ = 6; }		
	|		'Cl'											{ $$ = 7; }		
	|		'Fe'											{ $$ = 8; }		
	|		'Zn'											{ $$ = 9; }		
	|		'B'												{ $$ = 10; }		
	|		'Mn'											{ $$ = 11; }		
	|		'Cu'											{ $$ = 12; }		
	|		'Mo'											{ $$ = 13; }		
			;

substance:
			FORMULA formula_list purity_clause 				{ $$ = new ctx.Ast_Substance($2, $3); if($3 !== null && ($3 > 100.0 || $3 < 0.0)) throw "invalid purity value \"" + $3 + "\" at line: " + yylineno;  }
			;

number: 	
			DECIMAL											{ $$ = parseFloat($1); }
		|	INTEGER											{ $$ = parseInt($1); }
			;

purity_clause:
			/*%empty*/										{ $$ = null; }
		|	PURITY number 									{ $$ = $2; }
			;

formula_list:		
			molecula_stmt0  								{ $$ = new ctx.Ast_ExprSingle($1); } 
	|		formula_list '*' formula_list 					{ $$ = new ctx.Ast_ExprNode($1, $3); }
			;	

molecula_stmt0:	
			number formula_stmt0  							{ $$ = new ctx.Ast_Molecule($2, $1); } 
	|		formula_stmt0  									{ $$ = new ctx.Ast_Molecule($1, 1); } 
			;	

formula_stmt0: 	
			/*%empty*/ 										{ $$ = new ctx.Ast_Formula(); }
	|		formula_stmt0 formula_stmt1 					{ $$.push(new ctx.Ast_Atom($2)); }
	|		formula_stmt0 '(' formula_stmt0 ')' count		{ $$.push(new ctx.Ast_Group($3, $5)); }
			;	

count: 		/*%empty*/ 										{ $$ = 1; } 
	| 		INTEGER 										{ $$ = parseInt($1); }
			;
			
formula_stmt1:	
				'H' count 										{ $$ = [1, $2]; }
	| 		'B' count 										{ $$ = [5, $2]; }
	|			'C' count 										{ $$ = [6, $2]; }
	|			'N' count 										{ $$ = [7, $2]; }
	|			'O' count 										{ $$ = [8, $2]; }
	| 		'Na' count 										{ $$ = [11, $2]; }
	| 		'Mg' count 										{ $$ = [12, $2]; }
	| 		'Al' count 										{ $$ = [13, $2]; }
	| 		'Si' count 										{ $$ = [14, $2]; }
	|			'P' count 										{ $$ = [15, $2]; }
	| 		'S' count 										{ $$ = [16, $2]; }
	| 		'Cl' count 										{ $$ = [17, $2]; }
	| 		'K' count 										{ $$ = [19, $2]; }
	| 		'Ca' count 										{ $$ = [20, $2]; }
	| 		'Fe' count 										{ $$ = [26, $2]; }
	| 		'Mn' count 										{ $$ = [25, $2]; }
	| 		'Co' count 										{ $$ = [27, $2]; }
	| 		'Ni' count 										{ $$ = [28, $2]; }
	| 		'Cu' count 										{ $$ = [29, $2]; }
	| 		'Zn' count 										{ $$ = [30, $2]; }
	| 		'Mo' count 										{ $$ = [42, $2]; }
	| 		'Ag' count 										{ $$ = [47, $2]; }
			;



exp: 
			exp '+' exp 									{$$ = $1+$3;}
    | 		exp '-' exp 									{$$ = $1-$3;}
    | 		exp '*' exp 									{$$ = $1*$3;}
    | 		exp '/' exp 									{$$ = $1/$3;}
    | 		exp '^' exp 									{$$ = Math.pow($1, $3);}
    | 		'-' exp %prec UMINUS 							{$$ = -$2;}
    | 		'(' exp ')' 									{$$ = $2;}
    | 		number 											{$$ = $1;}
    | 		E												{$$ = Math.E;}
    | 		PI												{$$ = Math.PI;}
    		;